import { ChannelType } from "discord.js";

export type BlueprintRole = {
  placeholderId: string;
  name: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: string | null;
};

export type BlueprintOverwrite = {
  placeholderId: string;
  type: 0 | 1;
  allow: string;
  deny: string;
};

export type BlueprintChannel = {
  placeholderId: string;
  name: string;
  type: ChannelType;
  topic?: string | null;
  parentPlaceholderId?: string | null;
  nsfw?: boolean;
  bitrate?: number;
  userLimit?: number;
  slowmode?: number;
  overwrites?: BlueprintOverwrite[];
};

export type ServerBlueprint = {
  id: string;
  name: string;
  description: string;
  roles: BlueprintRole[];
  channels: BlueprintChannel[];
};

const TEMPLATE_URL =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.new\/|discord\.com\/template\/)([a-zA-Z0-9]+)/i;

export function parseTemplateCode(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(TEMPLATE_URL);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9]{2,32}$/.test(trimmed)) return trimmed;
  return null;
}

function cat(
  id: string,
  name: string,
  children: Omit<BlueprintChannel, "parentPlaceholderId">[],
): BlueprintChannel[] {
  return [
    { placeholderId: id, name, type: ChannelType.GuildCategory },
    ...children.map((ch) => ({ ...ch, parentPlaceholderId: id })),
  ];
}

export const KNOX_PRESETS: Record<string, ServerBlueprint> = {
  gaming: {
    id: "gaming",
    name: "ZARU Gaming",
    description: "LFG, clips, voice rooms, and staff logs for a game server",
    roles: [
      { placeholderId: "r-member", name: "Member", color: 0x57f287 },
      { placeholderId: "r-gamer", name: "Gamer", color: 0xe8ff47, hoist: true, mentionable: true },
      { placeholderId: "r-pc", name: "PC", mentionable: true },
      { placeholderId: "r-console", name: "Console", mentionable: true },
      { placeholderId: "r-mobile", name: "Mobile", mentionable: true },
    ],
    channels: [
      ...cat("c-info", "INFO", [
        { placeholderId: "rules", name: "rules", type: ChannelType.GuildText, topic: "Server rules" },
        {
          placeholderId: "announce",
          name: "announcements",
          type: ChannelType.GuildAnnouncement,
        },
        { placeholderId: "welcome", name: "welcome", type: ChannelType.GuildText },
      ]),
      ...cat("c-chat", "CHAT", [
        { placeholderId: "general", name: "general", type: ChannelType.GuildText },
        { placeholderId: "memes", name: "memes", type: ChannelType.GuildText },
        { placeholderId: "clips", name: "clips", type: ChannelType.GuildText },
      ]),
      ...cat("c-lfg", "LOOKING FOR GROUP", [
        { placeholderId: "lfg", name: "lfg", type: ChannelType.GuildText, topic: "Find a squad" },
        { placeholderId: "duo", name: "looking-for-duo", type: ChannelType.GuildText },
      ]),
      ...cat("c-voice", "VOICE", [
        { placeholderId: "vc1", name: "LFG 1", type: ChannelType.GuildVoice },
        { placeholderId: "vc2", name: "LFG 2", type: ChannelType.GuildVoice },
        { placeholderId: "afk", name: "AFK", type: ChannelType.GuildVoice },
      ]),
      ...cat("c-staff", "STAFF", [
        { placeholderId: "modlog", name: "mod-log", type: ChannelType.GuildText },
        { placeholderId: "staff", name: "staff-chat", type: ChannelType.GuildText },
      ]),
    ],
  },
  community: {
    id: "community",
    name: "ZARU Community",
    description: "Welcome, chat, lounge voice, and staff for a friends server",
    roles: [
      { placeholderId: "r-member", name: "Member", color: 0x57f287 },
      { placeholderId: "r-regular", name: "Regular", color: 0xe8ff47, hoist: true },
      { placeholderId: "r-helper", name: "Helper", color: 0x5865f2, hoist: true, mentionable: true },
    ],
    channels: [
      ...cat("c-info", "INFO", [
        { placeholderId: "rules", name: "rules", type: ChannelType.GuildText },
        { placeholderId: "announce", name: "announcements", type: ChannelType.GuildAnnouncement },
        { placeholderId: "intros", name: "introductions", type: ChannelType.GuildText },
      ]),
      ...cat("c-chat", "COMMUNITY", [
        { placeholderId: "general", name: "general", type: ChannelType.GuildText },
        { placeholderId: "media", name: "media", type: ChannelType.GuildText },
        { placeholderId: "offtopic", name: "off-topic", type: ChannelType.GuildText },
      ]),
      ...cat("c-voice", "VOICE", [
        { placeholderId: "lounge", name: "Lounge", type: ChannelType.GuildVoice },
        { placeholderId: "music", name: "Music", type: ChannelType.GuildVoice },
      ]),
      ...cat("c-staff", "STAFF", [
        { placeholderId: "modlog", name: "mod-log", type: ChannelType.GuildText },
        { placeholderId: "staff", name: "staff-chat", type: ChannelType.GuildText },
      ]),
    ],
  },
  study: {
    id: "study",
    name: "ZARU Study",
    description: "Resources, homework help, and quiet voice rooms",
    roles: [
      { placeholderId: "r-student", name: "Student", color: 0x57f287 },
      { placeholderId: "r-tutor", name: "Tutor", color: 0x5865f2, hoist: true, mentionable: true },
    ],
    channels: [
      ...cat("c-info", "INFO", [
        { placeholderId: "rules", name: "rules", type: ChannelType.GuildText },
        { placeholderId: "resources", name: "resources", type: ChannelType.GuildText },
      ]),
      ...cat("c-study", "STUDY", [
        { placeholderId: "general", name: "general", type: ChannelType.GuildText },
        { placeholderId: "homework", name: "homework-help", type: ChannelType.GuildText },
        { placeholderId: "notes", name: "notes", type: ChannelType.GuildText },
      ]),
      ...cat("c-voice", "VOICE", [
        { placeholderId: "silent", name: "Silent study", type: ChannelType.GuildVoice },
        { placeholderId: "group", name: "Group study", type: ChannelType.GuildVoice },
      ]),
    ],
  },
  creator: {
    id: "creator",
    name: "ZARU Creator",
    description: "Announcements, clips, collab, and feedback for a content server",
    roles: [
      { placeholderId: "r-fan", name: "Fan", color: 0x57f287 },
      { placeholderId: "r-creator", name: "Creator", color: 0xe8ff47, hoist: true, mentionable: true },
      { placeholderId: "r-editor", name: "Editor", color: 0xeb459e, mentionable: true },
    ],
    channels: [
      ...cat("c-info", "INFO", [
        { placeholderId: "announce", name: "announcements", type: ChannelType.GuildAnnouncement },
        { placeholderId: "schedule", name: "schedule", type: ChannelType.GuildText },
      ]),
      ...cat("c-content", "CONTENT", [
        { placeholderId: "clips", name: "clips", type: ChannelType.GuildText },
        { placeholderId: "collab", name: "collab", type: ChannelType.GuildText },
        { placeholderId: "feedback", name: "feedback", type: ChannelType.GuildText },
      ]),
      ...cat("c-voice", "VOICE", [
        { placeholderId: "collab-vc", name: "Collab", type: ChannelType.GuildVoice },
        { placeholderId: "stream", name: "Stream", type: ChannelType.GuildVoice },
      ]),
    ],
  },
};

type ApiRole = {
  id?: string | number;
  name?: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: string | number;
};

type ApiOverwrite = {
  id: string | number;
  type: number;
  allow: string | number;
  deny: string | number;
};

type ApiChannel = {
  id?: string | number;
  name?: string;
  type?: number;
  topic?: string | null;
  parent_id?: string | number | null;
  parentId?: string | number | null;
  nsfw?: boolean;
  bitrate?: number;
  user_limit?: number;
  userLimit?: number;
  rate_limit_per_user?: number;
  rateLimitPerUser?: number;
  permission_overwrites?: ApiOverwrite[];
  permissionOverwrites?: ApiOverwrite[];
};

type ApiSerializedGuild = {
  name?: string;
  description?: string | null;
  roles?: ApiRole[];
  channels?: ApiChannel[];
};

const SUPPORTED_CHANNEL_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
]);

export function blueprintFromDiscordTemplate(
  code: string,
  name: string,
  description: string | null,
  serialized: unknown,
): ServerBlueprint {
  const source = (serialized ?? {}) as ApiSerializedGuild;
  const roles: BlueprintRole[] = [];
  for (const [index, role] of (source.roles ?? []).entries()) {
    const roleName = role.name ?? "role";
    if (index === 0 || String(role.id) === "0" || roleName === "@everyone") continue;
    roles.push({
      placeholderId: String(role.id ?? `role-${index}`),
      name: roleName,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions == null ? null : String(role.permissions),
    });
  }

  const channels: BlueprintChannel[] = [];
  for (const [index, channel] of (source.channels ?? []).entries()) {
    const type = (channel.type ?? ChannelType.GuildText) as ChannelType;
    if (!SUPPORTED_CHANNEL_TYPES.has(type)) continue;
    const channelName = channel.name?.trim();
    if (!channelName) continue;
    channels.push({
      placeholderId: String(channel.id ?? `ch-${index}`),
      name: channelName,
      type,
      topic: channel.topic,
      parentPlaceholderId:
        channel.parent_id == null && channel.parentId == null
          ? null
          : String(channel.parent_id ?? channel.parentId),
      nsfw: channel.nsfw,
      bitrate: channel.bitrate,
      userLimit: channel.user_limit ?? channel.userLimit,
      slowmode: channel.rate_limit_per_user ?? channel.rateLimitPerUser,
      overwrites: (channel.permission_overwrites ?? channel.permissionOverwrites ?? [])
        .filter((ow) => ow.type === 0)
        .map((ow) => ({
          placeholderId: String(ow.id),
          type: 0 as const,
          allow: String(ow.allow ?? "0"),
          deny: String(ow.deny ?? "0"),
        })),
    });
  }

  return {
    id: `discord:${code}`,
    name,
    description: description || `Discord template ${code}`,
    roles,
    channels,
  };
}
