"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { KNOX_RANKS, MODULE_IDS, type KnoxRank, type ModuleId } from "@knox/shared";
import {
  canManageGuild,
  ensureGuildRow,
  fetchUserGuilds,
  updateGuildSettings,
  getGuildSettings,
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

export async function saveTicketsAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const ticketCategoryId = snowflakeOrNull(formData.get("ticketCategoryId"));
  const ticketLogChannelId = snowflakeOrNull(formData.get("ticketLogChannelId"));
  const maxRaw = Number(formData.get("maxOpenTicketsPerUser") ?? 1);
  const maxOpenTicketsPerUser =
    Number.isInteger(maxRaw) && maxRaw >= 1 && maxRaw <= 5 ? maxRaw : 1;
  const ticketSoftClose = formData.get("ticketSoftClose") === "on";

  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  await updateGuildSettings(
    guildId,
    {
      features: {
        ticketCategoryId,
        ticketLogChannelId,
        maxOpenTicketsPerUser,
        ticketSoftClose,
      },
    },
    userId,
  );
  revalidatePath(`/dashboard/${guildId}/tickets`);
}

export async function saveEconomyAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const intField = (name: string, max: number) => {
    const n = Number(String(formData.get(name) ?? "0").trim() || "0");
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} must be 0–${max}`);
    return n;
  };
  const economyEnabled = formData.get("economyEnabled") === "on";
  const currencyName = String(formData.get("currencyName") ?? "coins").trim().slice(0, 30) || "coins";
  const currencySymbol = String(formData.get("currencySymbol") ?? "💵").trim().slice(0, 8) || "💵";
  const moneyLogChannelId = snowflakeOrNull(formData.get("moneyLogChannelId"));

  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  await updateGuildSettings(
    guildId,
    {
      features: {
        economyEnabled,
        currencyName,
        currencySymbol,
        moneyLogChannelId,
        startBankBalance: intField("startBankBalance", 10_000_000),
        maxWalletBalance: intField("maxWalletBalance", 1_000_000_000),
        maxBankBalance: intField("maxBankBalance", 1_000_000_000),
        workMin: intField("workMin", 1_000_000),
        workMax: intField("workMax", 1_000_000),
        dailyMin: intField("dailyMin", 1_000_000),
        dailyMax: intField("dailyMax", 1_000_000),
      },
    },
    userId,
  );
  revalidatePath(`/dashboard/${guildId}/economy`);
}

const KINDS = ["spam", "invites", "links", "caps", "emoji", "mentions", "words", "duplicates", "attachments"] as const;
const ACTIONS = ["delete", "warn", "timeout", "kick", "ban"] as const;

export async function saveLogChannelsAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  await updateGuildSettings(
    guildId,
    {
      features: {
        logMessageChannelId: snowflakeOrNull(formData.get("logMessageChannelId")),
        logMemberChannelId: snowflakeOrNull(formData.get("logMemberChannelId")),
        logJoinChannelId: snowflakeOrNull(formData.get("logJoinChannelId")),
        logServerChannelId: snowflakeOrNull(formData.get("logServerChannelId")),
        logVoiceChannelId: snowflakeOrNull(formData.get("logVoiceChannelId")),
        logMessages: formData.get("logMessages") === "on",
        logMembers: formData.get("logMembers") === "on",
        logVoice: formData.get("logVoice") === "on",
        logServer: formData.get("logServer") === "on",
      },
    },
    userId,
  );
  revalidatePath(`/dashboard/${guildId}/logs`);
}

export async function saveWelcomeAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const raw = String(formData.get("welcomeBackgroundUrl") ?? "").trim();
  if (raw && !raw.startsWith("https://")) throw new Error("Background must be an https link, or empty");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  await updateGuildSettings(
    guildId,
    {
      community: {
        welcomeCardEnabled: formData.get("welcomeCardEnabled") === "on",
        welcomeBackgroundUrl: raw || null,
        welcomeChannelId: snowflakeOrNull(formData.get("welcomeChannelId")),
        welcomeEnabled: formData.get("welcomeEnabled") === "on",
      },
    },
    userId,
  );
  revalidatePath(`/dashboard/${guildId}/welcome`);
}

export async function saveAutomodRuleAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const kind = String(formData.get("kind") ?? "");
  const action = String(formData.get("action") ?? "delete");
  if (!KINDS.includes(kind as (typeof KINDS)[number])) throw new Error("Unknown detector");
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) throw new Error("Unknown action");
  const threshold = Number(formData.get("threshold") ?? 5);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new Error("Threshold must be 1–100");
  const words = String(formData.get("words") ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word.length > 1)
    .slice(0, 30);
  const ignoredChannelIds = String(formData.get("ignoredChannelIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ignoredChannelIds.some((id) => !SNOWFLAKE.test(id))) throw new Error("Ignored channels must be Discord ids");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const current = await getGuildSettings(guildId);
  if (current.moderation.automodRules.length >= 15) throw new Error("15 rules is the limit");
  const rule = {
    id: `r${Date.now().toString(36)}`.slice(0, 24),
    enabled: true,
    kind: kind as (typeof KINDS)[number],
    action: action as (typeof ACTIONS)[number],
    timeoutMinutes: 10,
    threshold,
    windowSec: 7,
    words,
    ignoredChannelIds,
    ignoredRoleIds: [] as string[],
  };
  await updateGuildSettings(guildId, { moderation: { automodRules: [...current.moderation.automodRules, rule].slice(0, 15) } }, userId);
  revalidatePath(`/dashboard/${guildId}/automod`);
}

export async function removeAutomodRuleAction(formData: FormData) {
  const guildId = String(formData.get("guildId") ?? "");
  const { userId, guild } = await requireGuildManager(guildId);
  const id = String(formData.get("id") ?? "");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const current = await getGuildSettings(guildId);
  await updateGuildSettings(
    guildId,
    { moderation: { automodRules: current.moderation.automodRules.filter((rule) => rule.id !== id) } },
    userId,
  );
  revalidatePath(`/dashboard/${guildId}/automod`);
}
