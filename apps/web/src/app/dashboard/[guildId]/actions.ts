"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { MODULE_IDS, type ModuleId } from "@knox/shared";
import {
  ensureGuildRow,
  updateGuildSettings,
  setPermissionRole,
} from "@/lib/guilds";
import { getDb } from "@/lib/db";
import type { KnoxRank } from "@knox/shared";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

export async function saveOverviewAction(formData: FormData) {
  const session = await requireUser();
  const guildId = String(formData.get("guildId") ?? "");
  const guildName = String(formData.get("guildName") ?? "Server");
  const embedColor = String(formData.get("embedColor") ?? "#E8FF47");
  const logChannelIdRaw = String(formData.get("logChannelId") ?? "").trim();
  const logChannelId = logChannelIdRaw.length ? logChannelIdRaw : null;

  const moduleFlags = {} as Partial<Record<ModuleId, boolean>>;
  for (const id of MODULE_IDS) {
    moduleFlags[id] = formData.get(`module_${id}`) === "on";
  }
  // core + admin stay on
  moduleFlags.core = true;
  moduleFlags.admin = true;

  const { db } = getDb();
  await ensureGuildRow(db, {
    id: guildId,
    name: guildName,
    icon: null,
  });

  await updateGuildSettings(
    guildId,
    { embedColor, logChannelId, moduleFlags },
    session.user.id,
  );

  revalidatePath(`/dashboard/${guildId}`);
}

export async function saveRankRoleAction(formData: FormData) {
  const session = await requireUser();
  const guildId = String(formData.get("guildId") ?? "");
  const rank = String(formData.get("rank") ?? "mod") as KnoxRank;
  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!guildId || !roleId) throw new Error("Missing fields");

  const { db } = getDb();
  await ensureGuildRow(db, { id: guildId, name: "Server", icon: null });
  await setPermissionRole(guildId, rank, roleId);
  void session;
  revalidatePath(`/dashboard/${guildId}/permissions`);
}

export async function saveModerationAction(formData: FormData) {
  const session = await requireUser();
  const guildId = String(formData.get("guildId") ?? "");
  const guildName = String(formData.get("guildName") ?? "Server");
  const maxMentions = Number(formData.get("maxMentions") ?? 5);
  const ignoredRaw = String(formData.get("ignoredChannelIds") ?? "");
  const ignoredChannelIds = ignoredRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { db } = getDb();
  await ensureGuildRow(db, { id: guildId, name: guildName, icon: null });

  await updateGuildSettings(
    guildId,
    {
      moderation: {
        antiInvite: formData.get("antiInvite") === "on",
        antiSpam: formData.get("antiSpam") === "on",
        maxMentions: Number.isFinite(maxMentions) ? maxMentions : 5,
        ignoredChannelIds,
      },
    },
    session.user.id,
  );

  revalidatePath(`/dashboard/${guildId}/moderation`);
}
