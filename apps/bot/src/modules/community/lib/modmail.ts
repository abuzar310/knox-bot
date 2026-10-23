// Modmail: a member DMs ZARU, staff answer in a thread of the modmail channel, and ZARU carries messages both ways.
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ThreadAutoArchiveDuration,
  type AnyThreadChannel,
  type Guild,
  type Message,
  type User,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { modmailBlocks, modmailThreads } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { logger } from "../../../logger.js";

export const MODMAIL_PICK_ID = "knox:mm:pick";
/** a staff message starting with this stays in the thread */
export const NOTE_PREFIX = "//";
const CHOICE_TTL_MS = 30 * 60_000;
const NUDGE_TTL_MS = 60 * 60_000;

export type ModmailRow = { id: number; guildId: string; userId: string };

/** the servers that could receive this person's DM: modmail on, community module on, they are a member, not blocked */
export async function modmailGuildsFor(client: KnoxClient, user: User): Promise<Guild[]> {
  const out: Guild[] = [];
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    if (!cached.settings.moduleFlags.community || !cached.settings.features.modmailChannelId) continue;
    const member = guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id).catch(() => null));
    if (!member) continue;
    const [blocked] = await client.db
      .select({ userId: modmailBlocks.userId })
      .from(modmailBlocks)
      .where(and(eq(modmailBlocks.guildId, guild.id), eq(modmailBlocks.userId, user.id)))
      .limit(1);
    if (blocked) continue;
    out.push(guild);
  }
  return out;
}

export function openThreadFor(client: KnoxClient, guildId: string, userId: string): ModmailRow | null {
  for (const row of client.modmailThreads.values()) {
    if (row.guildId === guildId && row.userId === userId) return row;
  }
  return null;
}

function attachmentLines(message: Message) {
  return [...message.attachments.values()].map((a) => `[${a.name}](${a.url})`);
}

/** starts a thread in the modmail channel with the member's details, and remembers it */
export async function openModmail(client: KnoxClient, guild: Guild, user: User, openedBy: string): Promise<{ row: ModmailRow; thread: AnyThreadChannel } | null> {
  const cached = await client.guildConfig.get(guild.id);
  const features = cached.settings.features;
  if (!features.modmailChannelId) return null;
  const channel = await guild.channels.fetch(features.modmailChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isThread() || channel.isDMBased() || !("threads" in channel)) return null;
  const thread = await channel.threads
    .create({ name: `${user.username} · ${user.id}`.slice(0, 100), autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek, reason: `Modmail ${openedBy}` })
    .catch((err) => {
      logger.warn({ err, guildId: guild.id }, "modmail thread could not be created");
      return null;
    });
  if (!thread) return null;
  const member = guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id).catch(() => null));
  const embed = knoxEmbed(cached.settings.embedColor)
    .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL() })
    .setTitle("New modmail")
    .setDescription(`Opened ${openedBy}. Reply in this thread and ZARU delivers it by DM; start a line with \`${NOTE_PREFIX}\` for a private note. \`/modmail close\` ends it.`)
    .addFields(
      { name: "Account created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Joined", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "not a member", inline: true },
      { name: "Roles", value: member ? String(Math.max(0, member.roles.cache.size - 1)) : "—", inline: true },
    );
  const ping = features.modmailPingRoleId ? `<@&${features.modmailPingRoleId}>` : "";
  await thread.send({ content: ping || undefined, embeds: [embed], allowedMentions: features.modmailPingRoleId ? { roles: [features.modmailPingRoleId] } : { parse: [] } }).catch(() => undefined);
  const [inserted] = await client.db.insert(modmailThreads).values({ guildId: guild.id, userId: user.id, threadId: thread.id }).returning({ id: modmailThreads.id });
  if (!inserted) return null;
  const row: ModmailRow = { id: inserted.id, guildId: guild.id, userId: user.id };
  client.modmailThreads.set(thread.id, row);
  return { row, thread };
}

async function threadOf(client: KnoxClient, row: ModmailRow): Promise<AnyThreadChannel | null> {
  const guild = client.guilds.cache.get(row.guildId);
  if (!guild) return null;
  const threadId = [...client.modmailThreads.entries()].find(([, r]) => r.id === row.id)?.[0];
  if (!threadId) return null;
  const channel = await guild.channels.fetch(threadId).catch(() => null);
  return channel?.isThread() ? channel : null;
}

/** a member's DM → the staff thread */
export async function relayToStaff(client: KnoxClient, row: ModmailRow, message: Message) {
  const thread = await threadOf(client, row);
  if (!thread) {
    await closeRow(client, row);
    return false;
  }
  if (thread.archived) await thread.setArchived(false).catch(() => undefined);
  const guild = client.guilds.cache.get(row.guildId);
  const cached = guild ? await client.guildConfig.get(guild.id) : null;
  const embed = knoxEmbed(cached?.settings.embedColor)
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content.slice(0, 4000) || "*(no text)*")
    .setTimestamp(message.createdAt);
  const files = attachmentLines(message);
  if (files.length) embed.addFields({ name: "Attachments", value: files.join("\n").slice(0, 1024) });
  await thread.send({ embeds: [embed], allowedMentions: { parse: [] } });
  await message.react("📨").catch(() => undefined);
  return true;
}

/** a staff message in the thread → the member's DM */
export async function relayToUser(client: KnoxClient, row: ModmailRow, message: Message) {
  const guild = client.guilds.cache.get(row.guildId);
  if (!guild) return;
  const user = await client.users.fetch(row.userId).catch(() => null);
  if (!user) return;
  const cached = await client.guildConfig.get(guild.id);
  const embed = knoxEmbed(cached.settings.embedColor)
    .setAuthor({ name: `${message.member?.displayName ?? message.author.username} · ${guild.name} staff`, iconURL: guild.iconURL() ?? undefined })
    .setDescription(message.content.slice(0, 4000) || "*(no text)*")
    .setTimestamp(message.createdAt);
  const files = attachmentLines(message);
  if (files.length) embed.addFields({ name: "Attachments", value: files.join("\n").slice(0, 1024) });
  const sent = await user.send({ embeds: [embed], allowedMentions: { parse: [] } }).then(() => true, () => false);
  await message.react(sent ? "📨" : "❌").catch(() => undefined);
  if (!sent) await message.reply({ content: "Couldn't deliver that: their DMs are closed or they blocked ZARU.", allowedMentions: { parse: [] } }).catch(() => undefined);
}

async function closeRow(client: KnoxClient, row: ModmailRow) {
  await client.db.update(modmailThreads).set({ open: false, closedAt: new Date() }).where(eq(modmailThreads.id, row.id));
  for (const [threadId, r] of client.modmailThreads) if (r.id === row.id) client.modmailThreads.delete(threadId);
}

/** ends a conversation: the member is told, the thread is locked and archived */
export async function closeModmail(client: KnoxClient, row: ModmailRow, closedBy: string, reason: string) {
  const thread = await threadOf(client, row);
  await closeRow(client, row);
  const guild = client.guilds.cache.get(row.guildId);
  const user = await client.users.fetch(row.userId).catch(() => null);
  await user
    ?.send({ content: `Your conversation with **${guild?.name ?? "the server"}** staff was closed${reason ? `: ${reason.slice(0, 500)}` : "."} Send a new message any time to start another.`, allowedMentions: { parse: [] } })
    .catch(() => undefined);
  if (thread) {
    await thread.send({ content: `Closed by ${closedBy}${reason ? `: ${reason.slice(0, 500)}` : "."}`, allowedMentions: { parse: [] } }).catch(() => undefined);
    await thread.setLocked(true).catch(() => undefined);
    await thread.setArchived(true).catch(() => undefined);
  }
}

/** when several servers could take the DM, the member picks one */
export function guildPicker(guilds: Guild[]) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MODMAIL_PICK_ID)
      .setPlaceholder("Which server is this for?")
      .addOptions(guilds.slice(0, 25).map((g) => ({ label: g.name.slice(0, 100), value: g.id }))),
  );
}

export function rememberChoice(client: KnoxClient, userId: string, guildId: string) {
  client.modmailChoice.set(userId, { guildId, at: Date.now() });
}

export function recentChoice(client: KnoxClient, userId: string): string | null {
  const choice = client.modmailChoice.get(userId);
  if (!choice) return null;
  if (Date.now() - choice.at > CHOICE_TTL_MS) {
    client.modmailChoice.delete(userId);
    return null;
  }
  return choice.guildId;
}

/** "nothing to do with your DM" is said at most once an hour per person */
export function shouldNudge(client: KnoxClient, userId: string) {
  const last = client.modmailNudged.get(userId) ?? 0;
  if (Date.now() - last < NUDGE_TTL_MS) return false;
  client.modmailNudged.set(userId, Date.now());
  return true;
}
