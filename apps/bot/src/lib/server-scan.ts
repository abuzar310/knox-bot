// A compact picture of a server: every channel with its category, visibility and last activity, every role with its
// powers and size, the bots present, Discord's AutoMod rules. Built from the cache, so it costs no API calls beyond
// the AutoMod list.
import { ChannelType, PermissionFlagsBits, type Guild, type GuildBasedChannel } from "discord.js";

export type ChannelKind = "text" | "announcement" | "voice" | "stage" | "forum" | "category" | "other";

export type ChannelInfo = {
  id: string;
  name: string;
  kind: ChannelKind;
  parentId: string | null;
  parentName: string | null;
  topic: string | null;
  position: number;
  nsfw: boolean;
  everyoneCanView: boolean;
  everyoneCanSend: boolean;
  /** days since the last message, null when unknown or never */
  lastActivityDays: number | null;
};

export type RoleInfo = {
  id: string;
  name: string;
  members: number;
  position: number;
  hoist: boolean;
  managed: boolean;
  admin: boolean;
  manageGuild: boolean;
  manageMessages: boolean;
  kickOrBan: boolean;
};

export type ServerSnapshot = {
  guildId: string;
  name: string;
  memberCount: number;
  createdDaysAgo: number;
  boosts: number;
  systemChannelId: string | null;
  rulesChannelId: string | null;
  publicUpdatesChannelId: string | null;
  afkChannelId: string | null;
  categories: Array<{ id: string; name: string; position: number }>;
  channels: ChannelInfo[];
  roles: RoleInfo[];
  bots: string[];
  automodRules: string[];
  features: string[];
};

function kindOf(channel: GuildBasedChannel): ChannelKind {
  switch (channel.type) {
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildAnnouncement:
      return "announcement";
    case ChannelType.GuildVoice:
      return "voice";
    case ChannelType.GuildStageVoice:
      return "stage";
    case ChannelType.GuildForum:
    case ChannelType.GuildMedia:
      return "forum";
    case ChannelType.GuildCategory:
      return "category";
    default:
      return "other";
  }
}

/** a Discord snowflake carries its creation time */
export function snowflakeAgeDays(id: string | null | undefined, now = Date.now()): number | null {
  if (!id || !/^\d{17,20}$/.test(id)) return null;
  const ms = Number((BigInt(id) >> 22n) + 1420070400000n);
  return Math.max(0, Math.round((now - ms) / 86_400_000));
}

export async function scanGuild(guild: Guild): Promise<ServerSnapshot> {
  const everyone = guild.roles.everyone;
  const channels: ChannelInfo[] = [];
  const categories: ServerSnapshot["categories"] = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.isThread()) continue;
    const kind = kindOf(channel);
    if (kind === "category") {
      categories.push({ id: channel.id, name: channel.name, position: channel.rawPosition });
      continue;
    }
    const perms = channel.permissionsFor(everyone);
    const lastMessageId = "lastMessageId" in channel ? (channel.lastMessageId as string | null) : null;
    channels.push({
      id: channel.id,
      name: channel.name,
      kind,
      parentId: channel.parentId ?? null,
      parentName: channel.parent?.name ?? null,
      topic: "topic" in channel && typeof channel.topic === "string" ? channel.topic.slice(0, 120) : null,
      position: channel.rawPosition,
      nsfw: "nsfw" in channel ? Boolean(channel.nsfw) : false,
      everyoneCanView: perms.has(PermissionFlagsBits.ViewChannel),
      everyoneCanSend: perms.has(PermissionFlagsBits.ViewChannel) && perms.has(PermissionFlagsBits.SendMessages),
      lastActivityDays: kind === "text" || kind === "announcement" ? snowflakeAgeDays(lastMessageId) : null,
    });
  }
  channels.sort((a, b) => a.position - b.position);
  categories.sort((a, b) => a.position - b.position);

  const roles: RoleInfo[] = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .map((r) => ({
      id: r.id,
      name: r.name,
      members: r.members.size,
      position: r.position,
      hoist: r.hoist,
      managed: r.managed,
      admin: r.permissions.has(PermissionFlagsBits.Administrator),
      manageGuild: r.permissions.has(PermissionFlagsBits.ManageGuild),
      manageMessages: r.permissions.has(PermissionFlagsBits.ManageMessages),
      kickOrBan: r.permissions.has(PermissionFlagsBits.KickMembers) || r.permissions.has(PermissionFlagsBits.BanMembers),
    }))
    .sort((a, b) => b.position - a.position);

  const bots = [...guild.members.cache.values()].filter((m) => m.user.bot && m.id !== guild.client.user?.id).map((m) => m.user.username).slice(0, 30);
  const me = guild.members.me;
  const automodRules =
    me?.permissions.has(PermissionFlagsBits.ManageGuild) ? ((await guild.autoModerationRules.fetch().catch(() => null))?.map((r) => r.name) ?? []) : [];

  return {
    guildId: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    createdDaysAgo: snowflakeAgeDays(guild.id) ?? 0,
    boosts: guild.premiumSubscriptionCount ?? 0,
    systemChannelId: guild.systemChannelId,
    rulesChannelId: guild.rulesChannelId,
    publicUpdatesChannelId: guild.publicUpdatesChannelId,
    afkChannelId: guild.afkChannelId,
    categories,
    channels,
    roles,
    bots,
    automodRules,
    features: [...guild.features].map(String),
  };
}
