// Follow creators and feeds. /feed add youtube|rss|twitch|kick posts new uploads, posts and live streams into a
// channel, with an optional role ping and a custom message; the checks run from the job tick (lib/feeds/poller.ts).
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { and, asc, count, eq } from "drizzle-orm";
import { feedSubscriptions, type FeedKind } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { isSafePublicUrl } from "../../../lib/safe-url.js";
import { SourceError } from "../../../lib/feeds/errors.js";
import { HttpError } from "../../../lib/feeds/http.js";
import { resolveYouTubeChannel } from "../../../lib/feeds/youtube.js";
import { twitchConfigured, twitchLoginFrom, twitchUser } from "../../../lib/feeds/twitch.js";
import { kickChannels, kickConfigured, kickSlugFrom } from "../../../lib/feeds/kick.js";
import {
  CHECK_INTERVAL_MS,
  announce,
  fetchFeedDoc,
  fetchLive,
  streamEmbed,
  type FeedSubscription,
} from "../../../lib/feeds/poller.js";
import { PLACEHOLDERS, renderAlert } from "../../../lib/feeds/template.js";

const MAX_FEEDS = 15;
const KIND_LABEL: Record<FeedKind, string> = { youtube: "YouTube", rss: "RSS", twitch: "Twitch", kick: "Kick" };
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

type Resolved = { source: string; label: string; seen: string[]; liveNow: boolean };

const withTarget = (s: SlashCommandSubcommandBuilder) =>
  s
    .addChannelOption((o) =>
      o
        .setName("post_in")
        .setDescription("Channel the alerts go to")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addRoleOption((o) => o.setName("ping").setDescription("Role to ping with each alert"))
    .addStringOption((o) => o.setName("message").setDescription(`Custom text; placeholders ${PLACEHOLDERS}`).setMaxLength(500));

const withNumber = (s: SlashCommandSubcommandBuilder) =>
  s.addIntegerOption((o) => o.setName("number").setDescription("Feed number from /feed list").setRequired(true).setMinValue(1));

export const feedCommand: KnoxCommand = {
  moduleId: "alerts",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("feed")
    .setDescription("Announce new YouTube uploads, RSS posts and Twitch or Kick live streams")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((g) =>
      g
        .setName("add")
        .setDescription("Follow a creator or feed")
        .addSubcommand((s) =>
          withTarget(
            s
              .setName("youtube")
              .setDescription("Follow a YouTube channel")
              .addStringOption((o) => o.setName("channel").setDescription("@handle, channel link or UC… id").setRequired(true).setMaxLength(200)),
          ),
        )
        .addSubcommand((s) =>
          withTarget(
            s
              .setName("rss")
              .setDescription("Follow an RSS or Atom feed")
              .addStringOption((o) => o.setName("url").setDescription("Feed address (https://…)").setRequired(true).setMaxLength(500)),
          ),
        )
        .addSubcommand((s) =>
          withTarget(
            s
              .setName("twitch")
              .setDescription("Announce when a Twitch channel goes live")
              .addStringOption((o) => o.setName("channel").setDescription("Twitch username or link").setRequired(true).setMaxLength(100)),
          ),
        )
        .addSubcommand((s) =>
          withTarget(
            s
              .setName("kick")
              .setDescription("Announce when a Kick channel goes live")
              .addStringOption((o) => o.setName("channel").setDescription("Kick username or link").setRequired(true).setMaxLength(100)),
          ),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Everything this server follows"))
    .addSubcommand((s) => withNumber(s.setName("remove").setDescription("Stop following a feed")))
    .addSubcommand((s) => withNumber(s.setName("test").setDescription("Post the latest item now, without a ping")))
    .addSubcommand((s) => withNumber(s.setName("resume").setDescription("Resume a feed paused after repeated failures")))
    .addSubcommand((s) =>
      withNumber(s.setName("edit").setDescription("Change where a feed posts, its ping role or its message"))
        .addChannelOption((o) =>
          o.setName("post_in").setDescription("New channel").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((o) => o.setName("ping").setDescription("New ping role"))
        .addStringOption((o) => o.setName("message").setDescription(`New text; placeholders ${PLACEHOLDERS}`).setMaxLength(500))
        .addBooleanOption((o) => o.setName("clear").setDescription("Remove the ping role and the custom message")),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if (group === "add") {
      await addFeed(interaction, guild, ctx.client, sub as FeedKind);
      return;
    }
    switch (sub) {
      case "list":
        await listFeeds(interaction, guild, ctx.client);
        return;
      case "remove":
        await removeFeed(interaction, guild, ctx.client);
        return;
      case "test":
        await testFeed(interaction, guild, ctx.client);
        return;
      case "resume":
        await resumeFeed(interaction, guild, ctx.client);
        return;
      case "edit":
        await editFeed(interaction, guild, ctx.client);
        return;
      default:
        return;
    }
  },
};

async function botPermissionsIn(guild: Guild, channelId: string) {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  return channel ? channel.permissionsFor(me) : null;
}

function postingProblem(perms: Awaited<ReturnType<typeof botPermissionsIn>>, channelId: string): string | null {
  if (!perms) return `I can't see <#${channelId}>.`;
  if (!perms.has(NEEDED)) return `I can't post in <#${channelId}>: I need View Channel, Send Messages and Embed Links there.`;
  return null;
}

function roleMention(guild: Guild, roleId: string | null) {
  if (!roleId) return "";
  return roleId === guild.id ? "@everyone" : `<@&${roleId}>`;
}

/** the feed's message with sample values, for confirmations and /feed test while a stream is offline */
function previewText(sub: FeedSubscription, guild: Guild) {
  const isStream = sub.kind === "twitch" || sub.kind === "kick";
  return renderAlert(sub.template, sub.kind, {
    role: roleMention(guild, sub.pingRoleId),
    author: sub.label,
    title: isStream ? "Example stream title" : "Example post title",
    url: isStream ? `https://${sub.kind === "twitch" ? "www.twitch.tv" : "kick.com"}/${sub.source}` : "https://example.com/new-post",
    game: "Just Chatting",
    viewers: "123",
    server: guild.name,
  });
}

function describeError(err: unknown): string {
  if (err instanceof SourceError) return err.message;
  if (err instanceof HttpError) {
    return err.status === 404
      ? "Nothing there (HTTP 404). Check the name or address."
      : `Couldn't read it right now (HTTP ${err.status}). Try again in a minute.`;
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return "That source took too long to answer. Try again in a minute.";
  }
  return "Couldn't read that source right now. Check the address and try again.";
}

async function resolveSource(kind: FeedKind, input: string): Promise<Resolved> {
  switch (kind) {
    case "youtube": {
      const { channelId, title } = await resolveYouTubeChannel(input);
      const doc = await fetchFeedDoc("youtube", channelId);
      return { source: channelId, label: (doc.title || title || channelId).slice(0, 100), seen: doc.items.map((i) => i.id), liveNow: false };
    }
    case "rss": {
      let url: URL;
      try {
        url = new URL(input.trim());
      } catch {
        throw new SourceError("That isn't a valid address. Paste the full feed URL, starting with https://");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new SourceError("Feed addresses must start with http:// or https://");
      if (!(await isSafePublicUrl(url.toString()))) throw new SourceError("That address isn't a public website ZARU may read.");
      const doc = await fetchFeedDoc("rss", url.toString());
      return { source: url.toString(), label: (doc.title || url.hostname).slice(0, 100), seen: doc.items.map((i) => i.id), liveNow: false };
    }
    case "twitch": {
      if (!twitchConfigured()) {
        throw new SourceError(
          "Twitch alerts aren't switched on for this ZARU host yet: it needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET from a free Twitch developer app (dev.twitch.tv).",
        );
      }
      const login = twitchLoginFrom(input);
      if (!login) throw new SourceError("That isn't a Twitch username. Use the name from twitch.tv/<name>.");
      const user = await twitchUser(login);
      if (!user) throw new SourceError(`No Twitch channel called **${login}**.`);
      const live = await fetchLive("twitch", [user.login]);
      return { source: user.login.toLowerCase(), label: user.display_name || user.login, seen: [], liveNow: live.has(user.login.toLowerCase()) };
    }
    case "kick": {
      if (!kickConfigured()) {
        throw new SourceError(
          "Kick alerts aren't switched on for this ZARU host yet: it needs KICK_CLIENT_ID and KICK_CLIENT_SECRET from a free Kick developer app (kick.com/settings/developer).",
        );
      }
      const slug = kickSlugFrom(input);
      if (!slug) throw new SourceError("That isn't a Kick username. Use the name from kick.com/<name>.");
      const found = (await kickChannels([slug])).get(slug);
      if (!found) throw new SourceError(`No Kick channel called **${slug}**.`);
      return { source: slug, label: found.slug, seen: [], liveNow: Boolean(found.stream?.is_live) };
    }
    default:
      throw new SourceError("Unknown feed kind.");
  }
}

async function addFeed(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient, kind: FeedKind) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.options.getChannel("post_in", true);
  const role = interaction.options.getRole("ping");
  const template = interaction.options.getString("message")?.trim() || null;

  const perms = await botPermissionsIn(guild, channel.id);
  const problem = postingProblem(perms, channel.id);
  if (problem || !perms) {
    await interaction.editReply(problem ?? `I can't see <#${channel.id}>.`);
    return;
  }
  const [existing] = await client.db.select({ n: count() }).from(feedSubscriptions).where(eq(feedSubscriptions.guildId, guild.id));
  if ((existing?.n ?? 0) >= MAX_FEEDS) {
    await interaction.editReply(`This server already follows ${MAX_FEEDS} feeds, the most ZARU checks for one server. Remove one with /feed remove first.`);
    return;
  }

  let resolved: Resolved;
  try {
    resolved = await resolveSource(kind, interaction.options.getString(kind === "rss" ? "url" : "channel", true));
  } catch (err) {
    await interaction.editReply(describeError(err));
    return;
  }

  const [created] = await client.db
    .insert(feedSubscriptions)
    .values({
      guildId: guild.id,
      channelId: channel.id,
      kind,
      source: resolved.source,
      label: resolved.label,
      pingRoleId: role?.id ?? null,
      template,
      seenIds: resolved.seen,
      createdBy: interaction.user.id,
    })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    await interaction.editReply(`<#${channel.id}> already gets ${KIND_LABEL[kind]} alerts for **${resolved.label}**.`);
    return;
  }

  const notes: string[] = [];
  if (role && role.id !== guild.id && !role.mentionable && !perms.has(PermissionFlagsBits.MentionEveryone)) {
    notes.push(
      `<@&${role.id}> isn't mentionable and I don't have "Mention @everyone, @here and all roles" in <#${channel.id}>, so the ping won't ring until one of those changes.`,
    );
  }
  const minutes = CHECK_INTERVAL_MS[kind] / 60_000;
  if (resolved.liveNow) notes.push(`**${resolved.label}** is live right now; the first alert lands within ${minutes} minutes.`);
  else if (kind === "twitch" || kind === "kick") notes.push(`Checked every ${minutes} minutes; you'll hear when they go live.`);
  else notes.push(`Checked every ${minutes} minutes; only items from now on are posted.`);

  const embed = knoxEmbed((await client.guildConfig.get(guild.id)).settings.embedColor)
    .setTitle(`Following · ${KIND_LABEL[kind]}`)
    .setDescription(`**#${created.id}** · **${created.label}** → <#${channel.id}>${role ? ` · pings ${roleMention(guild, role.id)}` : ""}`)
    .addFields({ name: "Message", value: previewText(created, guild).slice(0, 1024) }, { name: "Notes", value: notes.join("\n").slice(0, 1024) });
  await interaction.editReply({ embeds: [embed] });
}

async function listFeeds(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient) {
  const rows = await client.db.select().from(feedSubscriptions).where(eq(feedSubscriptions.guildId, guild.id)).orderBy(asc(feedSubscriptions.id));
  if (!rows.length) {
    await interaction.reply({ content: "This server follows nothing yet. Start with `/feed add youtube`.", ephemeral: true });
    return;
  }
  const lines = rows.map(
    (r) =>
      `**#${r.id}** ${KIND_LABEL[r.kind]} · **${r.label}** → <#${r.channelId}>` +
      `${r.pingRoleId ? ` · pings ${roleMention(guild, r.pingRoleId)}` : ""}${r.paused ? " · ⏸ paused" : ""}${r.live ? " · 🔴 live" : ""}`,
  );
  const embed = knoxEmbed((await client.guildConfig.get(guild.id)).settings.embedColor)
    .setTitle(`Followed feeds (${rows.length}/${MAX_FEEDS})`)
    .setDescription(lines.join("\n").slice(0, 4000));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function findFeed(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient): Promise<FeedSubscription | null> {
  const number = interaction.options.getInteger("number", true);
  const [row] = await client.db
    .select()
    .from(feedSubscriptions)
    .where(and(eq(feedSubscriptions.guildId, guild.id), eq(feedSubscriptions.id, number)))
    .limit(1);
  if (!row) await interaction.reply({ content: `No feed #${number} here. See /feed list.`, ephemeral: true });
  return row ?? null;
}

async function removeFeed(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient) {
  const sub = await findFeed(interaction, guild, client);
  if (!sub) return;
  await client.db.delete(feedSubscriptions).where(eq(feedSubscriptions.id, sub.id));
  await interaction.reply({ content: `Stopped following **${sub.label}** (#${sub.id}).`, ephemeral: true });
}

async function resumeFeed(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient) {
  const sub = await findFeed(interaction, guild, client);
  if (!sub) return;
  await client.db.update(feedSubscriptions).set({ paused: false, failures: 0, lastCheckedAt: null }).where(eq(feedSubscriptions.id, sub.id));
  await interaction.reply({ content: `**${sub.label}** (#${sub.id}) is being checked again.`, ephemeral: true });
}

async function testFeed(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient) {
  const sub = await findFeed(interaction, guild, client);
  if (!sub) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    if (sub.kind === "youtube" || sub.kind === "rss") {
      const doc = await fetchFeedDoc(sub.kind, sub.source);
      const item = doc.items[0];
      if (!item) {
        await interaction.editReply("That feed has no items right now.");
        return;
      }
      const posted = await announce(client, sub, { title: item.title, url: item.url, author: item.author || sub.label, game: "", viewers: "" }, undefined, false);
      await interaction.editReply(posted ? `Posted the latest item in <#${sub.channelId}>, without a ping.` : `I couldn't post in <#${sub.channelId}>.`);
      return;
    }
    const configured = sub.kind === "twitch" ? twitchConfigured() : kickConfigured();
    if (!configured) {
      await interaction.editReply(`${KIND_LABEL[sub.kind]} alerts aren't switched on for this ZARU host (no app credentials), so this feed can't be checked yet.`);
      return;
    }
    const info = (await fetchLive(sub.kind, [sub.source])).get(sub.source.toLowerCase());
    if (!info) {
      await interaction.editReply(`**${sub.label}** is offline right now. When they go live, ZARU will post:\n>>> ${previewText(sub, guild)}`);
      return;
    }
    const posted = await announce(
      client,
      sub,
      { title: info.title, url: info.url, author: info.author, game: info.game, viewers: String(info.viewers) },
      streamEmbed(info),
      false,
    );
    await interaction.editReply(posted ? `**${sub.label}** is live; posted the alert in <#${sub.channelId}> without a ping.` : `I couldn't post in <#${sub.channelId}>.`);
  } catch (err) {
    await interaction.editReply(describeError(err));
  }
}

async function editFeed(interaction: ChatInputCommandInteraction, guild: Guild, client: KnoxClient) {
  const sub = await findFeed(interaction, guild, client);
  if (!sub) return;
  const channel = interaction.options.getChannel("post_in");
  const role = interaction.options.getRole("ping");
  const message = interaction.options.getString("message")?.trim();
  const clear = interaction.options.getBoolean("clear") ?? false;
  if (!channel && !role && !message && !clear) {
    await interaction.reply({ content: "Nothing to change: give a new channel, ping role or message, or clear:True.", ephemeral: true });
    return;
  }
  if (channel) {
    const problem = postingProblem(await botPermissionsIn(guild, channel.id), channel.id);
    if (problem) {
      await interaction.reply({ content: problem, ephemeral: true });
      return;
    }
  }
  const patch: Partial<typeof feedSubscriptions.$inferInsert> = {};
  if (channel) patch.channelId = channel.id;
  if (role) patch.pingRoleId = role.id;
  if (message) patch.template = message;
  if (clear) {
    patch.pingRoleId = null;
    patch.template = null;
  }
  let updated: FeedSubscription | undefined;
  try {
    [updated] = await client.db.update(feedSubscriptions).set(patch).where(eq(feedSubscriptions.id, sub.id)).returning();
  } catch {
    await interaction.reply({
      content: `<#${channel?.id ?? sub.channelId}> already follows **${sub.label}**; remove one of the two instead.`,
      ephemeral: true,
    });
    return;
  }
  if (!updated) return;
  const embed = knoxEmbed((await client.guildConfig.get(guild.id)).settings.embedColor)
    .setTitle(`Updated · ${KIND_LABEL[updated.kind]}`)
    .setDescription(
      `**#${updated.id}** · **${updated.label}** → <#${updated.channelId}>${updated.pingRoleId ? ` · pings ${roleMention(guild, updated.pingRoleId)}` : ""}`,
    )
    .addFields({ name: "Message", value: previewText(updated, guild).slice(0, 1024) });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
