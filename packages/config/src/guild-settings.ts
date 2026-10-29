import { z } from "zod";
import {
  DEFAULT_MODULE_FLAGS,
  MODULE_IDS,
  type ModuleId,
} from "@knox/shared";

const moduleFlagsShape = MODULE_IDS.reduce(
  (acc: Record<ModuleId, z.ZodDefault<z.ZodBoolean>>, id: ModuleId) => {
    acc[id] = z.boolean().default(DEFAULT_MODULE_FLAGS[id]);
    return acc;
  },
  {} as Record<ModuleId, z.ZodDefault<z.ZodBoolean>>,
);

export const moduleFlagsSchema = z.object(moduleFlagsShape).default({
  ...DEFAULT_MODULE_FLAGS,
});

export const moderationConfigSchema = z
  .object({
    antiInvite: z.boolean().default(true),
    antiSpam: z.boolean().default(true),
    maxMentions: z.number().int().min(0).max(50).default(5),
    ignoredChannelIds: z.array(z.string()).default([]),
    antiPhishing: z.boolean().default(true),
    joinGateMinAccountAgeHours: z.number().int().min(0).max(8760).default(0),
    joinGateRequireAvatar: z.boolean().default(false),
    raidJoinsPerMinute: z.number().int().min(0).max(500).default(0),
    raidMode: z.boolean().default(false),
    raidModeUntil: z.string().nullable().default(null),
    autoDecancer: z.boolean().default(false),
    lockdownChannelIds: z.array(z.string()).max(200).default([]),
    aiModeration: z.boolean().default(false),
    blockedWords: z.array(z.string().min(2).max(60)).max(1000).default([]),
    // anti-nuke: if one admin/bot does too many destructive actions in a minute, ZARU stops them
    antiNuke: z.boolean().default(false),
    antiNukeAction: z.enum(["strip", "kick", "ban"]).default("strip"),
    antiNukeChannelLimit: z.number().int().min(0).max(50).default(4),
    antiNukeRoleLimit: z.number().int().min(0).max(50).default(4),
    antiNukeBanLimit: z.number().int().min(0).max(50).default(5),
    antiNukeKickLimit: z.number().int().min(0).max(50).default(5),
    antiNukeWebhookLimit: z.number().int().min(0).max(50).default(3),
    antiNukeWhitelist: z.array(z.string()).max(50).default([]),
    // warn escalation: reach N warns within the window and ZARU acts on its own
    warnEscalation: z.boolean().default(false),
    warnWindowDays: z.number().int().min(1).max(365).default(30),
    warnMuteAt: z.number().int().min(0).max(50).default(3),
    warnMuteMinutes: z.number().int().min(1).max(40320).default(60),
    warnKickAt: z.number().int().min(0).max(50).default(0),
    warnBanAt: z.number().int().min(0).max(50).default(5),
    // extra content filters (on top of Discord-native AutoMod)
    filterCaps: z.boolean().default(false),
    filterEmoji: z.boolean().default(false),
    filterRepeat: z.boolean().default(false),
    /** extra detectors a mod turns on from the dashboard, each with its own punishment */
    automodRules: z
      .array(
        z.object({
          id: z.string().min(1).max(24),
          enabled: z.boolean().default(true),
          kind: z.enum(["spam", "invites", "links", "caps", "emoji", "mentions", "words", "duplicates", "attachments"]),
          action: z.enum(["delete", "warn", "timeout", "kick", "ban"]).default("delete"),
          timeoutMinutes: z.number().int().min(1).max(40320).default(10),
          threshold: z.number().int().min(1).max(100).default(5),
          windowSec: z.number().int().min(2).max(120).default(7),
          words: z.array(z.string().min(1).max(40)).max(30).default([]),
          ignoredChannelIds: z.array(z.string()).max(20).default([]),
          ignoredRoleIds: z.array(z.string()).max(20).default([]),
        }),
      )
      .max(15)
      .default([]),
  })
  .default({
    antiInvite: true,
    antiSpam: true,
    maxMentions: 5,
    ignoredChannelIds: [],
    antiPhishing: true,
    joinGateMinAccountAgeHours: 0,
    joinGateRequireAvatar: false,
    raidJoinsPerMinute: 0,
    raidMode: false,
    raidModeUntil: null,
    autoDecancer: false,
    lockdownChannelIds: [],
    aiModeration: false,
    blockedWords: [],
    antiNuke: false,
    antiNukeAction: "strip",
    antiNukeChannelLimit: 4,
    antiNukeRoleLimit: 4,
    antiNukeBanLimit: 5,
    antiNukeKickLimit: 5,
    antiNukeWebhookLimit: 3,
    antiNukeWhitelist: [],
    warnEscalation: false,
    warnWindowDays: 30,
    warnMuteAt: 3,
    warnMuteMinutes: 60,
    warnKickAt: 0,
    warnBanAt: 5,
    filterCaps: false,
    filterEmoji: false,
    filterRepeat: false,
    automodRules: [],
  });

export const communityConfigSchema = z
  .object({
    welcomeEnabled: z.boolean().default(false),
    welcomeChannelId: z.string().nullable().default(null),
    welcomeMessage: z
      .string()
      .max(1800)
      .default(
        "Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.",
      ),
    goodbyeEnabled: z.boolean().default(false),
    goodbyeChannelId: z.string().nullable().default(null),
    goodbyeMessage: z
      .string()
      .max(1800)
      .default(
        "**{username}** left {server}. We're now {membercount} members.",
      ),
    invitesEnabled: z.boolean().default(false),
    invitesChannelId: z.string().nullable().default(null),
    autoRoleId: z.string().nullable().default(null),
    welcomeCardEnabled: z.boolean().default(false),
    welcomeDmMessage: z.string().max(1800).nullable().default(null),
    /** https image drawn behind the welcome card; null keeps the plain background */
    welcomeBackgroundUrl: z.string().max(500).nullable().default(null),
  })
  .default({
    welcomeEnabled: false,
    welcomeChannelId: null,
    welcomeMessage:
      "Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.",
    goodbyeEnabled: false,
    goodbyeChannelId: null,
    goodbyeMessage:
      "**{username}** left {server}. We're now {membercount} members.",
    invitesEnabled: false,
    invitesChannelId: null,
    autoRoleId: null,
    welcomeCardEnabled: false,
    welcomeDmMessage: null,
    welcomeBackgroundUrl: null,
  });

export const featureConfigSchema = z
  .object({
    levelsEnabled: z.boolean().default(true),
    levelUpChannelId: z.string().nullable().default(null),
    xpCooldownSec: z.number().int().min(5).max(600).default(60),
    starboardEnabled: z.boolean().default(false),
    starboardChannelId: z.string().nullable().default(null),
    starboardMin: z.number().int().min(1).max(50).default(3),
    ticketCategoryId: z.string().nullable().default(null),
    ticketLogChannelId: z.string().nullable().default(null),
    /** max open tickets per member (Ticket Tool-style limit) */
    maxOpenTicketsPerUser: z.number().int().min(1).max(5).default(1),
    /** when true, close locks the channel instead of deleting it (reopen with /ticket reopen) */
    ticketSoftClose: z.boolean().default(false),
    economyEnabled: z.boolean().default(true),
    countingChannelId: z.string().nullable().default(null),
    countingCurrent: z.number().int().min(0).default(0),
    countingLastUserId: z.string().nullable().default(null),
    voiceHubChannelId: z.string().nullable().default(null),
    /** voice channel ZARU stays in around the clock (/stay), or null */
    alwaysVoiceChannelId: z.string().nullable().default(null),
    logMessages: z.boolean().default(true),
    logMembers: z.boolean().default(true),
    logVoice: z.boolean().default(false),
    logServer: z.boolean().default(false),
    verifyRoleId: z.string().nullable().default(null),
    aiChatChannelId: z.string().nullable().default(null),
    // the economy's own face and payouts (UnbelievaBoat-style customisation)
    currencySymbol: z.string().min(1).max(8).default("💵"),
    currencyName: z.string().min(1).max(30).default("coins"),
    workMin: z.number().int().min(1).max(1_000_000).default(40),
    workMax: z.number().int().min(1).max(1_000_000).default(120),
    dailyMin: z.number().int().min(1).max(1_000_000).default(150),
    dailyMax: z.number().int().min(1).max(1_000_000).default(250),
    crimeMin: z.number().int().min(1).max(1_000_000).default(100),
    crimeMax: z.number().int().min(1).max(1_000_000).default(240),
    // chicken fight (UnbelievaBoat cock-fight): buy price and the starting win-chance range
    chickenPrice: z.number().int().min(1).max(10_000_000).default(500),
    chickenStrengthMin: z.number().int().min(1).max(99).default(50),
    chickenStrengthMax: z.number().int().min(1).max(99).default(70),
    // chat money (UnbelievaBoat): coins earned per message; max 0 = off
    chatMoneyMin: z.number().int().min(0).max(1_000_000).default(0),
    chatMoneyMax: z.number().int().min(0).max(1_000_000).default(0),
    chatMoneyCooldownSec: z.number().int().min(0).max(86_400).default(60),
    statsChannelId: z.string().nullable().default(null),
    birthdayChannelId: z.string().nullable().default(null),
    commandPrefix: z
      .string()
      .min(1)
      .max(8)
      .regex(/^\S+$/)
      .default("?"),
    musicMix: z.array(z.string().min(1).max(200)).max(20).default([]),
    /** announcement channels auto-published to their followers (/autopublish) */
    autoPublishChannelIds: z.array(z.string()).max(10).default([]),
    autoThreadChannelIds: z.array(z.string()).max(20).default([]),
    bumpReminderEnabled: z.boolean().default(false),
    bumpReminderRoleId: z.string().nullable().default(null),
    anniversaryChannelId: z.string().nullable().default(null),
    modmailChannelId: z.string().nullable().default(null),
    modmailPingRoleId: z.string().nullable().default(null),
    voiceXpEnabled: z.boolean().default(true),
    voiceXpPerMinute: z.number().int().min(0).max(50).default(5),
    digestChannelId: z.string().nullable().default(null),
    eventReminderChannelId: z.string().nullable().default(null),
    eventReminderRoleId: z.string().nullable().default(null),
    ticketTopics: z
      .array(
        z.object({
          name: z.string().min(1).max(40),
          emoji: z.string().max(40).nullable().default(null),
          description: z.string().max(100).nullable().default(null),
        }),
      )
      .max(10)
      .default([]),
    confessionChannelId: z.string().nullable().default(null),
    noXpChannelIds: z.array(z.string()).max(50).default([]),
    xpMultiplierRoles: z.array(z.object({ roleId: z.string(), multiplier: z.number().min(1).max(3) })).max(10).default([]),
    rulesChannelId: z.string().nullable().default(null),
    announcementsChannelId: z.string().nullable().default(null),
    /** channels that keep pictures and links and delete plain text (#media, #memes) */
    mediaOnlyChannelIds: z.array(z.string()).max(20).default([]),
    brainReportAt: z.string().nullable().default(null),
    /** roles ZARU will not kick, ban, mute, or disconnect */
    protectedRoleIds: z.array(z.string()).max(20).default([]),
    /** channel for staff coin grants, pay, and rob — not every gamble spin */
    moneyLogChannelId: z.string().nullable().default(null),
    /** bank balance brand-new members get on join (0 = off), like UnbelievaBoat set-start-balance */
    startBankBalance: z.number().int().min(0).max(10_000_000).default(0),
    /** max wallet (0 = no cap), like maximum-balance cash */
    maxWalletBalance: z.number().int().min(0).max(1_000_000_000).default(0),
    /** max bank (0 = no cap) */
    maxBankBalance: z.number().int().min(0).max(1_000_000_000).default(0),
    /** things the server owner told ZARU to remember: facts and how to answer */
    staffLessons: z
      .array(z.object({ text: z.string().min(1).max(400), by: z.string().max(40), at: z.string().max(40) }))
      .max(30)
      .default([]),
    /** optional split of the one log channel; empty falls back to logChannelId */
    logMessageChannelId: z.string().nullable().default(null),
    logMemberChannelId: z.string().nullable().default(null),
    logJoinChannelId: z.string().nullable().default(null),
    logServerChannelId: z.string().nullable().default(null),
    logVoiceChannelId: z.string().nullable().default(null),
    /** roles handed out this many minutes after someone joins */
    delayedRoles: z
      .array(z.object({ roleId: z.string().min(17).max(22), delayMinutes: z.number().int().min(1).max(43200) }))
      .max(8)
      .default([]),
    /** members waiting on a delayed role; the job grants them and clears the row */
    pendingDelayedRoles: z
      .array(z.object({ userId: z.string().min(17).max(22), roleId: z.string().min(17).max(22), dueAt: z.string().max(40) }))
      .max(80)
      .default([]),
    /** emoji reaction roles, with Carl-bot style modes */
    emojiRolePanels: z
      .array(
        z.object({
          messageId: z.string().min(17).max(22),
          channelId: z.string().min(17).max(22),
          mode: z.enum(["toggle", "unique", "verify", "reversed", "binding", "temporary"]).default("toggle"),
          durationMinutes: z.number().int().min(1).max(43200).nullable().default(null),
          requiredRoleId: z.string().nullable().default(null),
          pairs: z.array(z.object({ emoji: z.string().min(1).max(64), roleId: z.string().min(17).max(22) })).max(20).default([]),
        }),
      )
      .max(15)
      .default([]),
    /** channels emptied on a timer */
    scheduledPurges: z
      .array(
        z.object({
          channelId: z.string().min(17).max(22),
          everyHours: z.number().int().min(1).max(168),
          lastRunAt: z.string().nullable().default(null),
        }),
      )
      .max(8)
      .default([]),
    freeGamesChannelId: z.string().nullable().default(null),
    freeGamesSeen: z.array(z.string().max(80)).max(60).default([]),
  })
  .default({
    levelsEnabled: true,
    levelUpChannelId: null,
    xpCooldownSec: 60,
    starboardEnabled: false,
    starboardChannelId: null,
    starboardMin: 3,
    ticketCategoryId: null,
    ticketLogChannelId: null,
    maxOpenTicketsPerUser: 1,
    ticketSoftClose: false,
    economyEnabled: true,
    countingChannelId: null,
    countingCurrent: 0,
    countingLastUserId: null,
    voiceHubChannelId: null,
    alwaysVoiceChannelId: null,
    logMessages: true,
    logMembers: true,
    logVoice: false,
    logServer: false,
    verifyRoleId: null,
    aiChatChannelId: null,
    currencySymbol: "💵",
    currencyName: "coins",
    workMin: 40,
    workMax: 120,
    dailyMin: 150,
    dailyMax: 250,
    crimeMin: 100,
    crimeMax: 240,
    chickenPrice: 500,
    chickenStrengthMin: 50,
    chickenStrengthMax: 70,
    chatMoneyMin: 0,
    chatMoneyMax: 0,
    chatMoneyCooldownSec: 60,
    statsChannelId: null,
    birthdayChannelId: null,
    commandPrefix: "?",
    musicMix: [],
    autoPublishChannelIds: [],
    autoThreadChannelIds: [],
    bumpReminderEnabled: false,
    bumpReminderRoleId: null,
    anniversaryChannelId: null,
    modmailChannelId: null,
    modmailPingRoleId: null,
    voiceXpEnabled: true,
    voiceXpPerMinute: 5,
    digestChannelId: null,
    eventReminderChannelId: null,
    eventReminderRoleId: null,
    ticketTopics: [],
    confessionChannelId: null,
    noXpChannelIds: [],
    xpMultiplierRoles: [],
    rulesChannelId: null,
    announcementsChannelId: null,
    mediaOnlyChannelIds: [],
    brainReportAt: null,
    protectedRoleIds: [],
    moneyLogChannelId: null,
    startBankBalance: 0,
    maxWalletBalance: 0,
    maxBankBalance: 0,
    staffLessons: [],
    logMessageChannelId: null,
    logMemberChannelId: null,
    logJoinChannelId: null,
    logServerChannelId: null,
    logVoiceChannelId: null,
    delayedRoles: [],
    pendingDelayedRoles: [],
    emojiRolePanels: [],
    scheduledPurges: [],
    freeGamesChannelId: null,
    freeGamesSeen: [],
  });

export const guildSettingsSchema = z.object({
  locale: z.string().default("en"),
  embedColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#E8FF47"),
  logChannelId: z.string().nullable().default(null),
  moduleFlags: moduleFlagsSchema,
  moderation: moderationConfigSchema,
  community: communityConfigSchema,
  features: featureConfigSchema,
});

export type GuildSettings = z.infer<typeof guildSettingsSchema>;
export type ModerationConfig = z.infer<typeof moderationConfigSchema>;
export type CommunityConfig = z.infer<typeof communityConfigSchema>;
export type FeatureConfig = z.infer<typeof featureConfigSchema>;

export function parseGuildSettings(input: unknown): GuildSettings {
  return guildSettingsSchema.parse(input ?? {});
}

export function mergeModuleFlags(
  flags: Partial<Record<ModuleId, boolean>> | null | undefined,
): Record<ModuleId, boolean> {
  return {
    ...DEFAULT_MODULE_FLAGS,
    ...(flags ?? {}),
  };
}
