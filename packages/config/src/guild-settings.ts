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

export const guildSettingsSchema = z.object({
  locale: z.string().default("en"),
  embedColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#E8FF47"),
  logChannelId: z.string().nullable().default(null),
  moduleFlags: moduleFlagsSchema,
  moderation: moderationConfigSchema,
});

export type GuildSettings = z.infer<typeof guildSettingsSchema>;
export type ModerationConfig = z.infer<typeof moderationConfigSchema>;

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
