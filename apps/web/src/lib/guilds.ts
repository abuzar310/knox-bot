import { and, eq } from "drizzle-orm";
import {
  guildPermissionRoles,
  guildSettings,
  guilds,
  type KnoxDb,
} from "@knox/db";
import {
  mergeModuleFlags,
  parseGuildSettings,
  type GuildSettings,
  type ModerationConfig,
} from "@knox/config";
import { DEFAULT_MODULE_FLAGS, type KnoxRank, type ModuleId } from "@knox/shared";
import {
  DEFAULT_COMMUNITY_CONFIG,
  DEFAULT_MODERATION_CONFIG,
} from "@knox/db";
import { bumpGuildConfig } from "./notify";
import { getDb } from "./db";

export type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
};

const MANAGE_GUILD = 0x20n;

export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Discord guilds fetch failed: ${res.status}`);
  }
  return (await res.json()) as DiscordGuild[];
}

export function canManageGuild(guild: DiscordGuild) {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

export async function fetchBotGuildIds(): Promise<Set<string>> {
  const { db } = getDb();
  const rows = await db.select({ id: guilds.id }).from(guilds);
  return new Set(rows.map((r) => r.id));
}

export async function ensureGuildRow(
  db: KnoxDb,
  guild: { id: string; name: string; icon: string | null; ownerId?: string },
) {
  await db
    .insert(guilds)
    .values({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId ?? "unknown",
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guild.name,
        icon: guild.icon,
      },
    });

  const [existing] = await db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guild.id))
    .limit(1);

  if (!existing) {
    await db.insert(guildSettings).values({
      guildId: guild.id,
      moduleFlags: DEFAULT_MODULE_FLAGS,
      moderation: DEFAULT_MODERATION_CONFIG,
      community: DEFAULT_COMMUNITY_CONFIG,
    });
  }
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const { db } = getDb();
  const [row] = await db
    .select()
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1);

  if (!row) {
    return parseGuildSettings({ moduleFlags: DEFAULT_MODULE_FLAGS });
  }

  return parseGuildSettings({
    locale: row.locale,
    embedColor: row.embedColor,
    logChannelId: row.logChannelId,
    moduleFlags: mergeModuleFlags(row.moduleFlags),
    moderation: row.moderation ?? DEFAULT_MODERATION_CONFIG,
    community: row.community ?? DEFAULT_COMMUNITY_CONFIG,
  });
}

export async function updateGuildSettings(
  guildId: string,
  patch: {
    embedColor?: string;
    logChannelId?: string | null;
    moduleFlags?: Partial<Record<ModuleId, boolean>>;
    locale?: string;
    moderation?: Partial<ModerationConfig>;
  },
  actorId: string,
) {
  const { db } = getDb();
  const current = await getGuildSettings(guildId);
  const next = parseGuildSettings({
    locale: patch.locale ?? current.locale,
    embedColor: patch.embedColor ?? current.embedColor,
    logChannelId:
      patch.logChannelId === undefined ? current.logChannelId : patch.logChannelId,
    moduleFlags: mergeModuleFlags({
      ...current.moduleFlags,
      ...(patch.moduleFlags ?? {}),
    }),
    moderation: {
      ...current.moderation,
      ...(patch.moderation ?? {}),
    },
    community: current.community,
  });

  await db
    .insert(guildSettings)
    .values({
      guildId,
      locale: next.locale,
      embedColor: next.embedColor,
      logChannelId: next.logChannelId,
      moduleFlags: next.moduleFlags,
      moderation: next.moderation,
      community: next.community,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: {
        locale: next.locale,
        embedColor: next.embedColor,
        logChannelId: next.logChannelId,
        moduleFlags: next.moduleFlags,
        moderation: next.moderation,
        community: next.community,
        updatedAt: new Date(),
      },
    });

  await bumpGuildConfig(guildId);
  void actorId;
  return next;
}

export async function getPermissionRoles(guildId: string) {
  const { db } = getDb();
  return db
    .select()
    .from(guildPermissionRoles)
    .where(eq(guildPermissionRoles.guildId, guildId));
}

export async function setPermissionRole(
  guildId: string,
  rank: KnoxRank,
  roleId: string,
) {
  const { db } = getDb();
  await db
    .delete(guildPermissionRoles)
    .where(
      and(
        eq(guildPermissionRoles.guildId, guildId),
        eq(guildPermissionRoles.rank, rank),
      ),
    );

  await db.insert(guildPermissionRoles).values({ guildId, rank, roleId });
  await bumpGuildConfig(guildId);
}
