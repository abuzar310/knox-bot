import { eq } from "drizzle-orm";
import {
  commandOverrides,
  guildPermissionRoles,
  guildSettings,
  type KnoxDb,
} from "@knox/db";
import { parseGuildSettings, type GuildSettings } from "@knox/config";
import { DEFAULT_MODULE_FLAGS } from "@knox/shared";
import type { CommandOverrideRow, PermissionRoleRow } from "../types.js";

type CachedGuild = {
  settings: GuildSettings;
  permissionRows: PermissionRoleRow[];
  overrides: CommandOverrideRow[];
};

export class GuildConfigCache {
  private cache = new Map<string, CachedGuild>();

  constructor(private readonly db: KnoxDb) {}

  invalidate(guildId: string) {
    this.cache.delete(guildId);
  }

  async get(guildId: string): Promise<CachedGuild> {
    const hit = this.cache.get(guildId);
    if (hit) return hit;

    const [settingsRow] = await this.db
      .select()
      .from(guildSettings)
      .where(eq(guildSettings.guildId, guildId))
      .limit(1);

    const permissionRows = (await this.db
      .select({
        rank: guildPermissionRoles.rank,
        roleId: guildPermissionRoles.roleId,
      })
      .from(guildPermissionRoles)
      .where(eq(guildPermissionRoles.guildId, guildId))) as PermissionRoleRow[];

    const overrides = (await this.db
      .select({
        commandName: commandOverrides.commandName,
        allowType: commandOverrides.allowType,
        allowId: commandOverrides.allowId,
        effect: commandOverrides.effect,
      })
      .from(commandOverrides)
      .where(eq(commandOverrides.guildId, guildId))) as CommandOverrideRow[];

    const settings = parseGuildSettings(
      settingsRow
        ? {
            locale: settingsRow.locale,
            embedColor: settingsRow.embedColor,
            logChannelId: settingsRow.logChannelId,
            moduleFlags: settingsRow.moduleFlags ?? DEFAULT_MODULE_FLAGS,
            moderation: settingsRow.moderation,
          }
        : {
            moduleFlags: DEFAULT_MODULE_FLAGS,
          },
    );

    const value = { settings, permissionRows, overrides };
    this.cache.set(guildId, value);
    return value;
  }
}
