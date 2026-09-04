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

    const empty: CachedGuild = {
      settings: parseGuildSettings({ moduleFlags: DEFAULT_MODULE_FLAGS }),
      permissionRows: [],
      overrides: [],
    };

    // ponytail: cold Render Postgres can exceed Discord's 3s ack; serve defaults and fill cache later
    const load = this.load(guildId, empty)
      .then((value) => {
        this.cache.set(guildId, value);
        return value;
      })
      .catch(() => empty);
    return firstResolved(load, 1500, empty);
  }

  private async load(guildId: string, empty: CachedGuild): Promise<CachedGuild> {
    try {
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

      let settings: GuildSettings;
      try {
        settings = parseGuildSettings(
          settingsRow
            ? {
                locale: settingsRow.locale,
                embedColor: settingsRow.embedColor,
                logChannelId: settingsRow.logChannelId,
                moduleFlags: settingsRow.moduleFlags ?? DEFAULT_MODULE_FLAGS,
                moderation: settingsRow.moderation,
                community: settingsRow.community,
                features: settingsRow.features,
              }
            : {
                moduleFlags: DEFAULT_MODULE_FLAGS,
              },
        );
      } catch {
        settings = empty.settings;
      }

      return { settings, permissionRows, overrides };
    } catch {
      return empty;
    }
  }
}

export async function firstResolved<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
