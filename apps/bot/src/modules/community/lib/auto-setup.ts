// One-shot setup: channels, protections, panels and native AutoMod, all at once, from /setup auto or the button ZARU
// posts when it joins. Everything is idempotent: existing channels and settings are reused, never duplicated.
import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type TextChannel,
  type User,
} from "discord.js";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { aiProvider } from "../../../lib/ai-moderation.js";
import { loadCanvas } from "../../../lib/cards.js";
import { setupNativeAutomod } from "../../moderation/lib/native-automod.js";
import { panelComponents } from "./ticket-open.js";

const DEFAULT_TOPICS = [
  { name: "Support", emoji: "🛠️", description: "Help with the server or a problem" },
  { name: "Report a member", emoji: "🚩", description: "Someone breaking the rules" },
  { name: "Something else", emoji: "💬", description: "Anything that needs staff" },
];

type Work = { lines: string[]; warnings: string[] };

function staffRoleIds(guild: Guild, settingsRows: Array<{ rank: string; roleId: string }>) {
  const fromRanks = settingsRows.filter((r) => r.rank === "admin" || r.rank === "mod").map((r) => r.roleId);
  const byPower = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed && (r.permissions.has(PermissionFlagsBits.ManageGuild) || r.permissions.has(PermissionFlagsBits.ManageMessages)))
    .map((r) => r.id);
  return [...new Set([...fromRanks, ...byPower])].filter((id) => guild.roles.cache.has(id));
}

function findChannel(guild: Guild, type: ChannelType, names: string[]): GuildBasedChannel | null {
  const wanted = names.map((n) => n.toLowerCase());
  return guild.channels.cache.find((c) => c.type === type && wanted.includes(c.name.toLowerCase())) ?? null;
}

export async function autoSetup(client: KnoxClient, guild: Guild, actor: User): Promise<Work> {
  const work: Work = { lines: [], warnings: [] };
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const canChannels = me.permissions.has(PermissionFlagsBits.ManageChannels);
  const canRoles = me.permissions.has(PermissionFlagsBits.ManageRoles);
  if (!canChannels) work.warnings.push("I don't have **Manage Channels**, so no channels were created; existing ones were used where found.");
  if (!canRoles) work.warnings.push("I don't have **Manage Roles**, so staff-only channels couldn't be hidden from members.");

  const cached = await client.guildConfig.get(guild.id);
  let settings: GuildSettings = JSON.parse(JSON.stringify(cached.settings)) as GuildSettings;
  const staff = staffRoleIds(guild, cached.permissionRows);
  const staffOnly: OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ManageThreads] },
    ...staff.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads] })),
  ];
  const readOnly: OverwriteResolvable[] = [
    { id: guild.id, deny: [PermissionFlagsBits.SendMessages] },
    { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
  ];

  // a home for ZARU's channels
  let category: CategoryChannel | null = (findChannel(guild, ChannelType.GuildCategory, ["ZARU"]) as CategoryChannel | null) ?? null;
  if (!category && canChannels) {
    category = await guild.channels.create({ name: "ZARU", type: ChannelType.GuildCategory, reason: `ZARU setup by ${actor.tag}` }).catch(() => null);
    if (category) work.lines.push("Created the **ZARU** category.");
  }

  const ensureText = async (names: string[], overwrites: OverwriteResolvable[], label: string): Promise<TextChannel | null> => {
    const existing = findChannel(guild, ChannelType.GuildText, names) as TextChannel | null;
    if (existing) return existing;
    if (!canChannels) return null;
    const created = await guild.channels
      .create({ name: names[0]!, type: ChannelType.GuildText, parent: category ?? undefined, permissionOverwrites: canRoles ? overwrites : [], reason: `ZARU setup by ${actor.tag}` })
      .catch(() => null);
    if (created) work.lines.push(`Created <#${created.id}> (${label}).`);
    return created;
  };

  // log channel: everything moderation writes
  const existingLog = settings.logChannelId ? (guild.channels.cache.get(settings.logChannelId) as TextChannel | undefined) : undefined;
  const log = existingLog ?? (await ensureText(["zaru-log", "mod-log", "logs"], staffOnly, "staff-only log"));
  if (log) {
    settings.logChannelId = log.id;
    settings.features.logMessages = true;
    settings.features.logMembers = true;
    settings.features.logVoice = true;
    settings.features.digestChannelId = log.id;
    work.lines.push(`Logs, the weekly digest and AutoMod alerts go to <#${log.id}>.`);
  }

  // welcome: the system channel if Discord has one, else a welcome channel
  const existingWelcome = settings.community.welcomeChannelId ? (guild.channels.cache.get(settings.community.welcomeChannelId) as TextChannel | undefined) : undefined;
  const welcome = existingWelcome ?? (guild.systemChannel as TextChannel | null) ?? (await ensureText(["welcome", "general"], readOnly, "welcome messages"));
  if (welcome) {
    settings.community.welcomeEnabled = true;
    settings.community.welcomeChannelId = welcome.id;
    settings.community.goodbyeEnabled = true;
    settings.community.goodbyeChannelId = welcome.id;
    settings.community.welcomeCardEnabled = Boolean(await loadCanvas());
    settings.features.anniversaryChannelId = welcome.id;
    work.lines.push(`Welcome and goodbye messages${settings.community.welcomeCardEnabled ? " with picture cards" : ""} and anniversaries go to <#${welcome.id}>.`);
  }

  // tickets: a category for the private channels and a panel channel
  let ticketCategory = settings.features.ticketCategoryId ? (guild.channels.cache.get(settings.features.ticketCategoryId) as CategoryChannel | undefined) : undefined;
  if (!ticketCategory) ticketCategory = (findChannel(guild, ChannelType.GuildCategory, ["Tickets"]) as CategoryChannel | null) ?? undefined;
  if (!ticketCategory && canChannels) {
    ticketCategory = (await guild.channels.create({ name: "Tickets", type: ChannelType.GuildCategory, reason: `ZARU setup by ${actor.tag}` }).catch(() => null)) ?? undefined;
    if (ticketCategory) work.lines.push("Created the **Tickets** category.");
  }
  if (ticketCategory) {
    settings.features.ticketCategoryId = ticketCategory.id;
    if (!settings.features.ticketTopics.length) settings.features.ticketTopics = DEFAULT_TOPICS;
    const panelChannel = await ensureText(["open-a-ticket", "tickets", "support"], readOnly, "ticket panel");
    if (panelChannel) {
      const recent = await panelChannel.messages.fetch({ limit: 20 }).catch(() => null);
      const alreadyPosted = recent?.some((m) => m.author.id === me.id && m.components.length > 0) ?? false;
      if (!alreadyPosted) {
        await panelChannel
          .send({
            embeds: [knoxEmbed(settings.embedColor).setTitle("Need help?").setDescription("Pick what your ticket is about and tell us a little; a private channel with staff opens for you.")],
            components: panelComponents(settings.features.ticketTopics),
          })
          .catch(() => undefined);
        work.lines.push(`Ticket panel posted in <#${panelChannel.id}>.`);
      }
    }
  }

  // modmail: members DM ZARU, staff answer in threads here
  const modmail = settings.features.modmailChannelId ? (guild.channels.cache.get(settings.features.modmailChannelId) as TextChannel | undefined) : await ensureText(["modmail"], staffOnly, "modmail threads");
  if (modmail) {
    settings.features.modmailChannelId = modmail.id;
    work.lines.push(`Modmail is on: DMs to ZARU become threads in <#${modmail.id}>.`);
  }

  // starboard
  const starboard = settings.features.starboardChannelId ? (guild.channels.cache.get(settings.features.starboardChannelId) as TextChannel | undefined) : await ensureText(["starboard"], readOnly, "starboard");
  if (starboard) {
    settings.features.starboardEnabled = true;
    settings.features.starboardChannelId = starboard.id;
    settings.features.starboardMin = settings.features.starboardMin || 3;
    work.lines.push(`Starboard in <#${starboard.id}> at ${settings.features.starboardMin} ⭐.`);
  }

  // member counter
  if (!settings.features.statsChannelId && canChannels) {
    const counter = await guild.channels
      .create({
        name: `Members: ${guild.memberCount}`,
        type: ChannelType.GuildVoice,
        parent: category ?? undefined,
        permissionOverwrites: canRoles ? [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }] : [],
        reason: `ZARU setup by ${actor.tag}`,
      })
      .catch(() => null);
    if (counter) {
      settings.features.statsChannelId = counter.id;
      work.lines.push("Member-count channel added (updates every few minutes).");
    }
  }

  // protections
  settings.moderation.antiInvite = true;
  settings.moderation.antiSpam = true;
  settings.moderation.antiPhishing = true;
  settings.moderation.autoDecancer = true;
  if (settings.moderation.raidJoinsPerMinute === 0) settings.moderation.raidJoinsPerMinute = 10;
  settings.moderation.aiModeration = aiProvider() !== null;
  settings.features.voiceXpEnabled = true;
  settings.features.bumpReminderEnabled = true;
  work.lines.push(
    `Protection on: anti-phishing, anti-invite, anti-spam, unreadable-name cleanup, automatic raid mode at ${settings.moderation.raidJoinsPerMinute} joins/minute${settings.moderation.aiModeration ? ", AI moderation" : ""}.`,
  );
  if (!settings.moderation.aiModeration) work.warnings.push("AI moderation stays off until the host has OPENAI_API_KEY or ANTHROPIC_API_KEY.");

  settings = await persistGuildSettings(client, guild.id, settings);

  // Discord-native AutoMod rules (need Manage Server)
  if (me.permissions.has(PermissionFlagsBits.ManageGuild)) {
    const result = await setupNativeAutomod(guild, settings, cached.permissionRows, actor.tag, { wordLists: true, mentionLimit: 5, timeoutMinutes: 10, spam: true }).catch(() => null);
    if (result) work.lines.push(`Discord AutoMod: ${result.lines.join(" · ")}`);
  } else {
    work.warnings.push("I don't have **Manage Server**, so Discord's native AutoMod rules weren't created and raid mode can't pause invites.");
  }

  if (!cached.permissionRows.length) work.warnings.push("No staff roles are mapped yet: members with Manage Server count as admins and Manage Messages as mods. Map roles on the dashboard's Permissions page if you want finer control.");
  return work;
}
