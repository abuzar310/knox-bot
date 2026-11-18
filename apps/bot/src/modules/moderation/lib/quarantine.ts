// The Discord side of quarantine (rules in quarantine-kit.ts): the role and its channel, putting a member in
// and letting them out, the timed release, and the role being given or taken by hand.
import { ChannelType, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry, type GuildMember, type NonThreadGuildBasedChannel, type Role, type User } from "discord.js";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { modCases, quarantineAppeals, quarantineConfig, quarantines } from "@knox/db";
import { postAppealForm } from "./appeals.js";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { asQuarantine, markQuarantined, setQuarantineRole } from "../../../lib/role-guard.js";
import { createCase } from "./cases.js";
import { canModerate, logLine, protectedBlock, sendModLog } from "./modlog.js";
import {
  APPEAL_CHANNEL_NAME,
  HIDDEN_PERMISSIONS,
  QUARANTINE_ROLE_NAME,
  mergeKept,
  quarantineNotice,
  quarantineUntil,
  quarantinedRoleSet,
  quarantinesDue,
  rolesToRestore,
  rolesToStrip,
  stillVisible,
} from "./quarantine-kit.js";

/** a refusal or a failure whose text is meant for the moderator */
export class QuarantineError extends Error {}

const HIDE = Object.fromEntries(HIDDEN_PERMISSIONS.map((name) => [name, false])) as Record<(typeof HIDDEN_PERMISSIONS)[number], false>;

export async function getQuarantineConfig(client: KnoxClient, guildId: string) {
  const [row] = await client.db.select().from(quarantineConfig).where(eq(quarantineConfig.guildId, guildId)).limit(1);
  return row ?? null;
}

async function getRecord(client: KnoxClient, guildId: string, userId: string) {
  const [row] = await client.db
    .select()
    .from(quarantines)
    .where(and(eq(quarantines.guildId, guildId), eq(quarantines.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** every server's quarantine role and everyone quarantined, into the role gate: run once at start-up */
export async function loadQuarantineState(client: KnoxClient) {
  const servers = await client.db.select().from(quarantineConfig);
  const members = await client.db.select({ guildId: quarantines.guildId, userId: quarantines.userId }).from(quarantines);
  for (const row of servers) setQuarantineRole(row.guildId, row.roleId);
  for (const row of members) markQuarantined(row.guildId, row.userId, true);
  return { servers: servers.length, members: members.length };
}

/** servers whose set-up is running: the new-channel hook leaves the appeal channel it is making alone */
const settingUp = new Set<string>();

function hidable(channel: { type: ChannelType }): channel is NonThreadGuildBasedChannel {
  return channel.type !== ChannelType.PublicThread && channel.type !== ChannelType.PrivateThread && channel.type !== ChannelType.AnnouncementThread;
}

/**
 * Makes (or repairs) the role, the appeal channel and the deny on every other channel. Safe to run again: it
 * only adds what is missing, and names the channels it could not edit.
 */
export async function setupQuarantine(client: KnoxClient, guild: Guild, options: { reviewChannelId?: string | null }) {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new QuarantineError("I need the Manage Roles and Manage Channels permissions to set quarantine up.");
  }
  settingUp.add(guild.id);
  try {
    return await runSetup(client, guild, me, options);
  } finally {
    settingUp.delete(guild.id);
  }
}

async function runSetup(client: KnoxClient, guild: Guild, me: GuildMember, options: { reviewChannelId?: string | null }) {
  const saved = await getQuarantineConfig(client, guild.id);
  await guild.roles.fetch();
  await guild.channels.fetch();

  let role: Role | null = (saved && guild.roles.cache.get(saved.roleId)) || guild.roles.cache.find((r) => r.name === QUARANTINE_ROLE_NAME) || null;
  const madeRole = !role;
  if (!role) {
    role = await guild.roles.create({ name: QUARANTINE_ROLE_NAME, permissions: [], hoist: false, mentionable: false, reason: "Quarantine set-up" });
  }
  if (role.position >= me.roles.highest.position) {
    throw new QuarantineError(`Move my role above **${role.name}** in Server Settings → Roles, then run the set-up again.`);
  }

  const savedAppeal = saved?.appealChannelId ? guild.channels.cache.get(saved.appealChannelId) : null;
  let appeal = savedAppeal?.type === ChannelType.GuildText ? savedAppeal : null;
  const madeChannel = !appeal;
  if (!appeal) {
    const staffRoles = guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id && r.permissions.has(PermissionFlagsBits.ModerateMembers));
    appeal = await guild.channels.create({
      name: APPEAL_CHANNEL_NAME,
      type: ChannelType.GuildText,
      topic: "Quarantined members can write to the moderators here. Nobody else sees this channel.",
      reason: "Quarantine set-up",
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] },
        { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks] },
        ...staffRoles.map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] })),
      ],
    });
  }

  // categories first, so a channel that follows its category still matches it afterwards
  const channels = [...guild.channels.cache.values()]
    .filter(hidable)
    .filter((channel) => channel.id !== appeal.id)
    .sort((a, b) => Number(b.type === ChannelType.GuildCategory) - Number(a.type === ChannelType.GuildCategory));
  let hidden = 0;
  const failed: string[] = [];
  for (const channel of channels) {
    const existing = channel.permissionOverwrites.cache.get(role.id);
    if (existing && HIDDEN_PERMISSIONS.every((name) => existing.deny.has(PermissionFlagsBits[name]))) continue;
    const ok = await channel.permissionOverwrites.edit(role, HIDE, { reason: "Quarantine set-up" }).then(
      () => true,
      () => false,
    );
    if (ok) hidden++;
    else failed.push(channel.id);
  }

  const reviewChannelId = options.reviewChannelId === undefined ? (saved?.reviewChannelId ?? null) : options.reviewChannelId;
  await client.db
    .insert(quarantineConfig)
    .values({ guildId: guild.id, roleId: role.id, appealChannelId: appeal.id, reviewChannelId })
    .onConflictDoUpdate({ target: quarantineConfig.guildId, set: { roleId: role.id, appealChannelId: appeal.id, reviewChannelId } });
  setQuarantineRole(guild.id, role.id);
  // a repair can find this channel hidden from the role (it was made while the saved id was still the old one)
  await appeal.permissionOverwrites
    .edit(role, { ViewChannel: true, ReadMessageHistory: true, SendMessages: true }, { reason: "Quarantine set-up" })
    .catch(() => failed.push(appeal.id));
  await postAppealForm(client, guild, { appealChannelId: appeal.id, appealFormMessageId: saved?.appealFormMessageId ?? null }, null);
  return { role, appeal, madeRole, madeChannel, hidden, failed, total: channels.length };
}

/** a channel made after the set-up is hidden from the role too */
export async function hideNewChannel(client: KnoxClient, channel: NonThreadGuildBasedChannel) {
  if (settingUp.has(channel.guild.id)) return;
  const config = await getQuarantineConfig(client, channel.guild.id);
  if (!config || channel.id === config.appealChannelId) return;
  await channel.permissionOverwrites.edit(config.roleId, HIDE, { reason: "Quarantine: new channel" }).catch(() => undefined);
}

/** why this moderator may not quarantine this member, or null */
export function quarantineRefusal(moderator: GuildMember, target: GuildMember, settings: GuildSettings | null): string | null {
  if (target.user.bot) return "Bots can't be quarantined.";
  return protectedBlock(target, settings?.features.protectedRoleIds) ?? canModerate(moderator, target);
}

/** the channels the member can still see, by id (see stillVisible) */
function leaks(guild: Guild, member: GuildMember, keptRoleIds: readonly string[], appealChannelId: string | null): string[] {
  const channels = [...guild.channels.cache.values()].filter(hidable).map((channel) => ({
    id: channel.id,
    viewAllowedFor: [...channel.permissionOverwrites.cache.values()].filter((o) => o.allow.has(PermissionFlagsBits.ViewChannel)).map((o) => o.id),
  }));
  return stillVisible(channels, member.id, keptRoleIds, appealChannelId);
}

/**
 * Puts a member in quarantine. The remembered roles are written before any role changes, and merged with an
 * earlier record: that list is the only copy.
 */
export async function quarantineMember(
  client: KnoxClient,
  guild: Guild,
  member: GuildMember,
  input: { moderator: User; reason: string; ms: number | null; evidence?: string | null; settings: GuildSettings | null; byHand?: boolean },
) {
  const config = await getQuarantineConfig(client, guild.id);
  if (!config) throw new QuarantineError("Quarantine isn't set up here yet: run `/quarantine setup` first.");
  const ids = { everyoneId: guild.id, quarantineRoleId: config.roleId };
  const held = [...member.roles.cache.values()].map((role) => ({ id: role.id, managed: role.managed }));
  const strip = rolesToStrip(held, ids);
  const stays = quarantinedRoleSet(held, ids);
  const until = quarantineUntil(input.ms, Date.now());

  const before = await getRecord(client, guild.id, member.id);
  const roleIds = mergeKept(before?.roleIds ?? [], strip);
  await client.db
    .insert(quarantines)
    .values({ guildId: guild.id, userId: member.id, roleIds, until })
    .onConflictDoUpdate({ target: [quarantines.guildId, quarantines.userId], set: { roleIds, until } });
  markQuarantined(guild.id, member.id, true);
  try {
    await asQuarantine(() => member.roles.set(stays, `Quarantined by ${input.moderator.tag}: ${input.reason}`.slice(0, 500)));
  } catch (error) {
    // nothing changed on Discord: put the record back as it was
    if (before) {
      await client.db.update(quarantines).set({ roleIds: before.roleIds, until: before.until }).where(eq(quarantines.id, before.id));
    } else {
      await client.db.delete(quarantines).where(and(eq(quarantines.guildId, guild.id), eq(quarantines.userId, member.id)));
      markQuarantined(guild.id, member.id, false);
    }
    throw new QuarantineError(`I couldn't change their roles: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  await member.voice.disconnect("Quarantined").catch(() => undefined);
  await postAppealForm(client, guild, { appealChannelId: config.appealChannelId, appealFormMessageId: config.appealFormMessageId }, input.settings);

  const modCase = await createCase(client.db, {
    guildId: guild.id,
    type: "quarantine",
    targetId: member.id,
    moderatorId: input.moderator.id,
    reason: input.reason,
    durationMs: input.ms,
    active: true,
    evidence: input.evidence ?? null,
  });
  await client.db.update(quarantines).set({ caseNumber: modCase.caseNumber }).where(and(eq(quarantines.guildId, guild.id), eq(quarantines.userId, member.id)));
  await sendModLog(guild, input.settings, {
    title: input.byHand ? "Member quarantined (by hand)" : "Member quarantined",
    caseNumber: modCase.caseNumber,
    action: "quarantine",
    target: member.user,
    moderator: input.moderator,
    reason: input.reason,
    durationMs: input.ms,
    color: 0x4f545c,
  }).catch(() => undefined);
  const told = await member.user
    .send({ content: quarantineNotice({ server: guild.name, reason: input.reason, caseNumber: modCase.caseNumber, until, appealChannelId: config.appealChannelId }), allowedMentions: { parse: [] } })
    .then(
      () => true,
      () => false,
    );
  const keptRoleIds = stays.filter((id) => id !== config.roleId);
  return { caseNumber: modCase.caseNumber, until, told, stillSees: leaks(guild, member, keptRoleIds, config.appealChannelId), appealChannelId: config.appealChannelId };
}

/**
 * Lets a member out: their remembered roles come back, as far as they still exist and ZARU may give them. The
 * record goes only after the roles are back.
 */
export async function releaseMember(client: KnoxClient, guild: Guild, userId: string, input: { moderator: User; reason: string; settings: GuildSettings | null; byHand?: boolean }) {
  const record = await getRecord(client, guild.id, userId);
  if (!record) return { ok: false as const };
  const config = await getQuarantineConfig(client, guild.id);
  const member = await guild.members.fetch(userId).catch(() => null);
  const lost: string[] = [];
  if (member) {
    // their own roles, staff roles among them: only a role that is gone, managed, or above ZARU cannot come back
    const { give, lost: missing } = rolesToRestore(record.roleIds, (id) => {
      const role = guild.roles.cache.get(id);
      return !role ? "gone" : !role.managed && role.editable ? "ok" : "blocked";
    });
    lost.push(...missing.map((id) => guild.roles.cache.get(id)?.name ?? `deleted role ${id}`));
    const next = [...new Set([...member.roles.cache.keys()].filter((id) => id !== guild.id && id !== config?.roleId).concat(give))];
    try {
      await asQuarantine(() => member.roles.set(next, `Released by ${input.moderator.tag}: ${input.reason}`.slice(0, 500)));
    } catch (error) {
      throw new QuarantineError(`I couldn't give their roles back, so they stay quarantined: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  await client.db.delete(quarantines).where(eq(quarantines.id, record.id));
  markQuarantined(guild.id, userId, false);
  // an appeal still open when the quarantine ends is closed, so a stale Accept can never lift a later one;
  // best-effort, because the roles are already back and a failed close must not fail the release
  await client.db
    .update(quarantineAppeals)
    .set({ status: "closed" })
    .where(and(eq(quarantineAppeals.guildId, guild.id), eq(quarantineAppeals.userId, userId), eq(quarantineAppeals.status, "open")))
    .catch((err: unknown) => logger.warn({ err, guildId: guild.id, userId }, "could not close the open appeal after a release"));
  await client.db
    .update(modCases)
    .set({ active: false })
    .where(and(eq(modCases.guildId, guild.id), eq(modCases.targetId, userId), eq(modCases.type, "quarantine"), eq(modCases.active, true)));

  const target = member?.user ?? (await client.users.fetch(userId).catch(() => null));
  const modCase = await createCase(client.db, { guildId: guild.id, type: "unquarantine", targetId: userId, moderatorId: input.moderator.id, reason: input.reason, active: false });
  if (target) {
    await sendModLog(guild, input.settings, {
      title: input.byHand ? "Quarantine lifted (by hand)" : "Quarantine lifted",
      caseNumber: modCase.caseNumber,
      action: "unquarantine",
      target,
      moderator: input.moderator,
      reason: lost.length ? `${input.reason}\nNot given back: ${lost.join(", ")}`.slice(0, 1000) : input.reason,
      color: 0x3ddc84,
    }).catch(() => undefined);
    if (member) await target.send({ content: `**${guild.name}:** your quarantine was lifted. You can see the server again.`, allowedMentions: { parse: [] } }).catch(() => undefined);
  }
  return { ok: true as const, caseNumber: modCase.caseNumber, lost, left: !member };
}

/** the loop's job: timed quarantines whose time is up are lifted, each on its own so one failure holds nobody else */
export async function runQuarantineExpiry(client: KnoxClient) {
  const me = client.user;
  if (!me) return;
  const rows = await client.db
    .select()
    .from(quarantines)
    .where(and(isNotNull(quarantines.until), lte(quarantines.until, new Date())));
  for (const row of quarantinesDue(rows, Date.now())) {
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    try {
      const cached = await client.guildConfig.get(guild.id);
      await releaseMember(client, guild, row.userId, {
        moderator: me,
        reason: row.caseNumber ? `The quarantine of case #${row.caseNumber} ran out` : "The quarantine ran out",
        settings: cached.degraded ? null : cached.settings,
      });
    } catch (err) {
      logger.warn({ err, guildId: row.guildId, userId: row.userId }, "quarantine could not be lifted on time");
    }
  }
}

/** someone who left while quarantined comes back quarantined */
export async function requarantineOnJoin(client: KnoxClient, member: GuildMember) {
  const record = await getRecord(client, member.guild.id, member.id);
  if (!record) return;
  const config = await getQuarantineConfig(client, member.guild.id);
  if (!config) return;
  await asQuarantine(() => member.roles.add(config.roleId, record.caseNumber ? `Still quarantined (case #${record.caseNumber})` : "Still quarantined")).catch((err) =>
    logger.warn({ err, guildId: member.guild.id, userId: member.id }, "returning member could not be quarantined again"),
  );
}

/**
 * The Quarantined role given or taken by hand in Discord. Giving it is checked like the command, with the person
 * who gave it as the moderator: Discord only checks the role's rank, so without this a junior moderator could
 * strip an admin. True when the entry was about the quarantine role.
 */
export async function quarantineRoleByHand(client: KnoxClient, entry: GuildAuditLogsEntry, guild: Guild, settings: GuildSettings | null): Promise<boolean> {
  const config = await getQuarantineConfig(client, guild.id);
  if (!config || !entry.targetId || !entry.executorId) return false;
  const has = (key: string) => entry.changes.some((change) => String(change.key) === key && Array.isArray(change.new) && change.new.some((role) => (role as { id?: string }).id === config.roleId));
  const added = has("$add");
  const removed = has("$remove");
  if (!added && !removed) return false;
  if (entry.executorId === client.user?.id) return true;
  const executor = await client.users.fetch(entry.executorId).catch(() => null);
  if (!executor) return true;
  const reason = entry.reason?.trim() || "No reason given (done by hand in Discord)";

  if (removed) {
    await releaseMember(client, guild, entry.targetId, { moderator: executor, reason, settings, byHand: true });
    return true;
  }
  const [target, moderator] = await Promise.all([guild.members.fetch(entry.targetId).catch(() => null), guild.members.fetch(entry.executorId).catch(() => null)]);
  if (!target) return true;
  const refusal = moderator ? quarantineRefusal(moderator, target, settings) : "The person who gave the role is no longer in the server.";
  if (refusal) {
    await asQuarantine(() => target.roles.remove(config.roleId, "Quarantine by hand refused")).catch(() => undefined);
    await logLine(guild, settings, "Quarantine by hand refused", `${executor.tag} gave the Quarantined role to ${target.user.tag}. I took it off again: ${refusal}`, 0xff5c5c).catch(() => undefined);
    return true;
  }
  await quarantineMember(client, guild, target, { moderator: executor, reason, ms: null, settings, byHand: true });
  return true;
}
