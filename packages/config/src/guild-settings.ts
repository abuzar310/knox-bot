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
});

export type GuildSettings = z.infer<typeof guildSettingsSchema>;
export type ModerationConfig = z.infer<typeof moderationConfigSchema>;
export type CommunityConfig = z.infer<typeof communityConfigSchema>;

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
