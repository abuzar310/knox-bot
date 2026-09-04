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
  })
  .default({
    antiInvite: true,
    antiSpam: true,
    maxMentions: 5,
    ignoredChannelIds: [],
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
    economyEnabled: z.boolean().default(true),
    countingChannelId: z.string().nullable().default(null),
    countingCurrent: z.number().int().min(0).default(0),
    countingLastUserId: z.string().nullable().default(null),
    voiceHubChannelId: z.string().nullable().default(null),
    logMessages: z.boolean().default(true),
    logMembers: z.boolean().default(true),
    logVoice: z.boolean().default(false),
    verifyRoleId: z.string().nullable().default(null),
    statsChannelId: z.string().nullable().default(null),
    birthdayChannelId: z.string().nullable().default(null),
    commandPrefix: z
      .string()
      .min(1)
      .max(8)
      .regex(/^\S+$/)
      .default("z!"),
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
    economyEnabled: true,
    countingChannelId: null,
    countingCurrent: 0,
    countingLastUserId: null,
    voiceHubChannelId: null,
    logMessages: true,
    logMembers: true,
    logVoice: false,
    verifyRoleId: null,
    statsChannelId: null,
    birthdayChannelId: null,
    commandPrefix: "z!",
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
