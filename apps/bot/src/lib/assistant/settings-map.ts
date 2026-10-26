// ZARU's own settings, named the way a person would say them, so "send welcome messages in #hello" or "turn off music"
// become a change to the right field. Every key here is a real settings field; the zod parser validates the result.
import { MODULE_IDS, type ModuleId } from "@knox/shared";
import type { GuildSettings } from "@knox/config";

type Section = "moderation" | "community" | "features";

export type Toggle = { section: Section; key: string; label: string } | { module: ModuleId; label: string };

export const TOGGLES: Record<string, Toggle> = {
  ai_moderation: { section: "moderation", key: "aiModeration", label: "AI moderation" },
  anti_phishing: { section: "moderation", key: "antiPhishing", label: "anti-phishing" },
  anti_invite: { section: "moderation", key: "antiInvite", label: "invite-link filter" },
  anti_spam: { section: "moderation", key: "antiSpam", label: "anti-spam" },
  auto_decancer: { section: "moderation", key: "autoDecancer", label: "auto-decancer (fixes unreadable names)" },
  join_gate_avatar: { section: "moderation", key: "joinGateRequireAvatar", label: "join gate: avatar required" },
  welcome: { section: "community", key: "welcomeEnabled", label: "welcome messages" },
  goodbye: { section: "community", key: "goodbyeEnabled", label: "goodbye messages" },
  invite_tracking: { section: "community", key: "invitesEnabled", label: "invite tracking" },
  welcome_cards: { section: "community", key: "welcomeCardEnabled", label: "welcome cards" },
  levels: { section: "features", key: "levelsEnabled", label: "levels / XP" },
  economy: { section: "features", key: "economyEnabled", label: "economy" },
  starboard: { section: "features", key: "starboardEnabled", label: "starboard" },
  voice_xp: { section: "features", key: "voiceXpEnabled", label: "voice XP" },
  bump_reminder: { section: "features", key: "bumpReminderEnabled", label: "bump reminders" },
  log_messages: { section: "features", key: "logMessages", label: "message logs" },
  log_members: { section: "features", key: "logMembers", label: "member logs" },
  log_voice: { section: "features", key: "logVoice", label: "voice logs" },
};
for (const id of MODULE_IDS) {
  TOGGLES[`module_${id}`] = { module: id, label: `${id} module` };
  if (!TOGGLES[id]) TOGGLES[id] = { module: id, label: `${id} module` };
}

export type ChannelSetting = { section: Section | "top"; key: string; kind: "text" | "voice" | "category" | "role" | "any"; label: string; alsoEnable?: [Section, string] };

export const SETTINGS: Record<string, ChannelSetting> = {
  log_channel: { section: "top", key: "logChannelId", kind: "text", label: "log channel" },
  welcome_channel: { section: "community", key: "welcomeChannelId", kind: "text", label: "welcome channel", alsoEnable: ["community", "welcomeEnabled"] },
  goodbye_channel: { section: "community", key: "goodbyeChannelId", kind: "text", label: "goodbye channel", alsoEnable: ["community", "goodbyeEnabled"] },
  invites_channel: { section: "community", key: "invitesChannelId", kind: "text", label: "invite-tracking channel", alsoEnable: ["community", "invitesEnabled"] },
  auto_role: { section: "community", key: "autoRoleId", kind: "role", label: "role given on join" },
  level_up_channel: { section: "features", key: "levelUpChannelId", kind: "text", label: "level-up channel" },
  starboard_channel: { section: "features", key: "starboardChannelId", kind: "text", label: "starboard channel", alsoEnable: ["features", "starboardEnabled"] },
  ticket_category: { section: "features", key: "ticketCategoryId", kind: "category", label: "ticket category" },
  ticket_log_channel: { section: "features", key: "ticketLogChannelId", kind: "text", label: "ticket log channel" },
  counting_channel: { section: "features", key: "countingChannelId", kind: "text", label: "counting channel" },
  voice_hub_channel: { section: "features", key: "voiceHubChannelId", kind: "voice", label: "voice hub (join to create a room)" },
  always_voice_channel: { section: "features", key: "alwaysVoiceChannelId", kind: "voice", label: "24/7 music voice channel" },
  verify_role: { section: "features", key: "verifyRoleId", kind: "role", label: "verified role" },
  stats_channel: { section: "features", key: "statsChannelId", kind: "any", label: "member-count channel" },
  birthday_channel: { section: "features", key: "birthdayChannelId", kind: "text", label: "birthday channel" },
  anniversary_channel: { section: "features", key: "anniversaryChannelId", kind: "text", label: "join-anniversary channel" },
  modmail_channel: { section: "features", key: "modmailChannelId", kind: "text", label: "modmail channel" },
  modmail_ping_role: { section: "features", key: "modmailPingRoleId", kind: "role", label: "role pinged for modmail" },
  digest_channel: { section: "features", key: "digestChannelId", kind: "text", label: "weekly digest channel" },
  event_reminder_channel: { section: "features", key: "eventReminderChannelId", kind: "text", label: "event reminder channel" },
  event_reminder_role: { section: "features", key: "eventReminderRoleId", kind: "role", label: "role pinged for events" },
  confession_channel: { section: "features", key: "confessionChannelId", kind: "text", label: "confessions channel" },
  rules_channel: { section: "features", key: "rulesChannelId", kind: "text", label: "rules channel" },
  announcements_channel: { section: "features", key: "announcementsChannelId", kind: "text", label: "announcements channel" },
  bump_reminder_role: { section: "features", key: "bumpReminderRoleId", kind: "role", label: "role pinged for bump reminders" },
};

type Bag = Record<string, unknown>;

/** a settings object with one field changed; null for an unknown name */
export function applySetting(settings: GuildSettings, name: string, value: string | null): GuildSettings | null {
  const def = SETTINGS[normalize(name)];
  if (!def) return null;
  const next = structuredClone(settings) as unknown as Bag;
  if (def.section === "top") next[def.key] = value;
  else (next[def.section] as Bag)[def.key] = value;
  if (def.alsoEnable && value) (next[def.alsoEnable[0]] as Bag)[def.alsoEnable[1]] = true;
  return next as unknown as GuildSettings;
}

/** a settings object with one switch flipped; null for an unknown name */
export function applyToggle(settings: GuildSettings, name: string, enabled: boolean): GuildSettings | null {
  const def = TOGGLES[normalize(name)];
  if (!def) return null;
  const next = structuredClone(settings) as unknown as Bag;
  if ("module" in def) (next.moduleFlags as Bag)[def.module] = enabled;
  else (next[def.section] as Bag)[def.key] = enabled;
  return next as unknown as GuildSettings;
}

export function toggleState(settings: GuildSettings, name: string): boolean | null {
  const def = TOGGLES[normalize(name)];
  if (!def) return null;
  const bag = settings as unknown as Bag;
  return "module" in def ? Boolean((bag.moduleFlags as Bag)[def.module]) : Boolean((bag[def.section] as Bag)[def.key]);
}

export function settingLabel(name: string) {
  return SETTINGS[normalize(name)]?.label ?? TOGGLES[normalize(name)]?.label ?? name;
}

export function normalize(name: string) {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^the_/, "");
}

/** what the planner gets to know about ZARU's configuration, for questions and to avoid redundant changes */
export function zaruSummary(settings: GuildSettings) {
  const bag = settings as unknown as Bag;
  const channels: Record<string, string> = {};
  for (const [name, def] of Object.entries(SETTINGS)) {
    const value = def.section === "top" ? bag[def.key] : (bag[def.section] as Bag)[def.key];
    if (typeof value === "string" && value) channels[name] = value;
  }
  const on: string[] = [];
  const off: string[] = [];
  for (const name of Object.keys(TOGGLES)) {
    if (name.startsWith("module_")) continue;
    (toggleState(settings, name) ? on : off).push(name);
  }
  return { settings: channels, on, off, raidMode: settings.moderation.raidMode, lockdownChannels: settings.moderation.lockdownChannelIds.length, blockedWords: settings.moderation.blockedWords.length };
}
