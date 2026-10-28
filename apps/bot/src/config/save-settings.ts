import { eq } from "drizzle-orm";
import {
  DEFAULT_COMMUNITY_CONFIG,
  DEFAULT_FEATURE_CONFIG,
  DEFAULT_MODERATION_CONFIG,
  guildSettings,
  guilds,
  notifyGuildConfig,
} from "@knox/db";
import { parseGuildSettings, type GuildSettings } from "@knox/config";
import { DEFAULT_MODULE_FLAGS } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { invalidateEconomyCaps } from "../lib/economy-caps.js";

export async function ensureGuildSettings(
  client: KnoxClient,
  guild: { id: string; name: string; icon: string | null; ownerId: string },
): Promise<GuildSettings> {
  await client.db
    .insert(guilds)
    .values({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.ownerId,
      },
    });

  const current = await client.guildConfig.get(guild.id);
  await client.db
    .insert(guildSettings)
    .values({
      guildId: guild.id,
      locale: current.settings.locale,
      embedColor: current.settings.embedColor,
      logChannelId: current.settings.logChannelId,
      moduleFlags: current.settings.moduleFlags ?? DEFAULT_MODULE_FLAGS,
      moderation: current.settings.moderation ?? DEFAULT_MODERATION_CONFIG,
      community: current.settings.community ?? DEFAULT_COMMUNITY_CONFIG,
      features: current.settings.features ?? DEFAULT_FEATURE_CONFIG,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: guildSettings.guildId });

  client.guildConfig.invalidate(guild.id);
  return (await client.guildConfig.get(guild.id)).settings;
}

/** thrown when a save would be built on stand-in defaults (the database hadn't answered yet) */
export class SettingsNotLoadedError extends Error {
  constructor() {
    super("ZARU is still loading this server's settings from the database. Try again in a few seconds.");
    this.name = "SettingsNotLoadedError";
  }
}

export async function persistGuildSettings(
  client: KnoxClient,
  guildId: string,
  next: GuildSettings,
) {
  // every caller builds `next` from guildConfig.get(); if that gave defaults (nothing cached), writing would
  // wipe the real row
  if (!client.guildConfig.peek(guildId)) throw new SettingsNotLoadedError();
  const parsed = parseGuildSettings(next);
  await client.db
    .insert(guildSettings)
    .values({
      guildId,
      locale: parsed.locale,
      embedColor: parsed.embedColor,
      logChannelId: parsed.logChannelId,
      moduleFlags: parsed.moduleFlags,
      moderation: parsed.moderation,
      community: parsed.community,
      features: parsed.features,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: {
        locale: parsed.locale,
        embedColor: parsed.embedColor,
        logChannelId: parsed.logChannelId,
        moduleFlags: parsed.moduleFlags,
        moderation: parsed.moderation,
        community: parsed.community,
        features: parsed.features,
        updatedAt: new Date(),
      },
    });

  await notifyGuildConfig(client.pool, guildId);
  client.guildConfig.invalidate(guildId);
  invalidateEconomyCaps(guildId);
  return parsed;
}
