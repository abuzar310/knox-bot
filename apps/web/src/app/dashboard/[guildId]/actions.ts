"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { KNOX_RANKS, MODULE_IDS, type KnoxRank, type ModuleId } from "@knox/shared";
import {
  canManageGuild,
  ensureGuildRow,
  fetchUserGuilds,
  updateGuildSettings,
  setPermissionRole,
  type DiscordGuild,
} from "@/lib/guilds";
import { getDb } from "@/lib/db";

const SNOWFLAKE = /^\d{17,20}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Every save must come from someone who can manage that server on Discord: the page checks this before it
 * renders, and this checks it again before anything is written, because a form can name any guild id.
 */
async function requireGuildManager(guildId: string): Promise<{ userId: string; guild: DiscordGuild }> {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken) throw new Error("Unauthorized");
  if (!SNOWFLAKE.test(guildId)) throw new Error("Bad server id");
  const guild = (await fetchUserGuilds(session.accessToken)).find((g) => g.id === guildId);
  if (!guild || !canManageGuild(guild)) throw new Error("You can't manage that server");
  return { userId: session.user.id, guild };
}

const snowflakeOrNull = (raw: FormDataEntryValue | null) => {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!SNOWFLAKE.test(v)) throw new Error("That id doesn't look like a Discord id");
  return v;
};

export async function saveOverviewAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const embedColor = String(formData.get("embedColor") ?? "#E8FF47").trim();
  if (!HEX_COLOR.test(embedColor)) throw new Error("Colour must look like #E8FF47");
  const logChannelId = snowflakeOrNull(formData.get("logChannelId"));

  const moduleFlags = {} as Partial<Record<ModuleId, boolean>>;
  for (const id of MODULE_IDS) {
    moduleFlags[id] = formData.get(`module_${id}`) === "on";
  }
  // core + admin stay on
  moduleFlags.core = true;
  moduleFlags.admin = true;

  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  await updateGuildSettings(guildId, { embedColor, logChannelId, moduleFlags }, userId);
  revalidatePath(`/dashboard/${guildId}`);
}

export async function saveRankRoleAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { guild } = await requireGuildManager(guildId);
  const rank = String(formData.get("rank") ?? "mod") as KnoxRank;
  const roleId = String(formData.get("roleId") ?? "").trim();
  // "owner" is the server owner and nobody else; @everyone (the role whose id is the server's) is never a rank
  if (!KNOX_RANKS.includes(rank) || rank === "owner") throw new Error("That rank can't be mapped to a role");
  if (!SNOWFLAKE.test(roleId) || roleId === guildId) throw new Error("Pick a real role, not @everyone");

  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  await setPermissionRole(guildId, rank, roleId);
  revalidatePath(`/dashboard/${guildId}/permissions`);
}

export async function saveModerationAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const maxMentionsRaw = Number(formData.get("maxMentions") ?? 5);
  const maxMentions = Number.isInteger(maxMentionsRaw) && maxMentionsRaw >= 1 && maxMentionsRaw <= 50 ? maxMentionsRaw : 5;
  const ignoredChannelIds = String(formData.get("ignoredChannelIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ignoredChannelIds.some((id) => !SNOWFLAKE.test(id))) throw new Error("Channel ids must be Discord ids, comma separated");
  const boundedInt = (raw: FormDataEntryValue | null, max: number) => {
    const n = Number(String(raw ?? "0").trim() || "0");
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`Use a whole number between 0 and ${max}`);
    return n;
  };
  const joinGateMinAccountAgeHours = boundedInt(formData.get("joinGateMinAccountAgeHours"), 8760);
  const raidJoinsPerMinute = boundedInt(formData.get("raidJoinsPerMinute"), 500);

  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  // raidMode / raidModeUntil are the bot's live state and are kept as they are (updateGuildSettings merges)
  await updateGuildSettings(
    guildId,
    {
      moderation: {
        antiInvite: formData.get("antiInvite") === "on",
        antiSpam: formData.get("antiSpam") === "on",
        maxMentions,
        ignoredChannelIds,
        antiPhishing: formData.get("antiPhishing") === "on",
        joinGateMinAccountAgeHours,
        joinGateRequireAvatar: formData.get("joinGateRequireAvatar") === "on",
        raidJoinsPerMinute,
      },
    },
    userId,
  );
  revalidatePath(`/dashboard/${guildId}/moderation`);
}
