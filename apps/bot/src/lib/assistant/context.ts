// What the model gets to see about the server: enough to name every channel, role and member by exact id, plus the
// facts a staff member might ask about (members, boosts, verification, who is in voice), ZARU's own settings, and the
// things ZARU manages (recent cases, feeds, scheduled posts, tags, auto-responses, stickies, giveaways).
import { ChannelType, GuildVerificationLevel, type Guild } from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import type { GuildSettings } from "@knox/config";
import { autoResponses, customTags, feedSubscriptions, giveaways, modCases, scheduledPosts, stickyMessages } from "@knox/db";
import type { KnoxClient } from "../../client.js";
import { plainName } from "../server-brain.js";
import { zaruSummary } from "./settings-map.js";

const MAX_MEMBERS = 300;

export async function serverContext(client: KnoxClient, guild: Guild, settings: GuildSettings) {
  const channels = [...guild.channels.cache.values()]
    .filter((c) => !c.isThread() && c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      name: c.name,
      plain: plainName(c.name),
      kind: c.type === ChannelType.GuildVoice ? "voice" : c.type === ChannelType.GuildStageVoice ? "stage" : c.type === ChannelType.GuildAnnouncement ? "announcement" : c.type === ChannelType.GuildText ? "text" : c.type === ChannelType.GuildForum ? "forum" : "other",
      category: c.parent?.name ?? null,
      inVoice: c.isVoiceBased() ? c.members.size : undefined,
    }));
  const categories = [...guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name }));
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, members: r.members.size, managed: r.managed, position: r.position }));
  if (guild.members.cache.size < Math.min(guild.memberCount, MAX_MEMBERS)) await guild.members.fetch({ limit: MAX_MEMBERS }).catch(() => undefined);
  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .slice(0, MAX_MEMBERS)
    .map((m) => ({ id: m.id, username: m.user.username, display: m.displayName, roles: m.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.name), voice: m.voice.channel?.name, timedOut: m.isCommunicationDisabled() || undefined }));
  const owner = guild.members.cache.get(guild.ownerId);
  const server = {
    name: guild.name,
    members: guild.memberCount,
    bots: guild.members.cache.filter((m) => m.user.bot).size,
    inVoiceNow: guild.members.cache.filter((m) => m.voice.channelId).size,
    boosts: guild.premiumSubscriptionCount ?? 0,
    boostTier: guild.premiumTier,
    verification: GuildVerificationLevel[guild.verificationLevel],
    owner: owner ? { id: owner.id, name: owner.displayName } : { id: guild.ownerId },
    created: guild.createdAt.toISOString().slice(0, 10),
    afkChannel: guild.afkChannel?.name ?? null,
    systemChannel: guild.systemChannel?.name ?? null,
    emojis: guild.emojis.cache.map((e) => e.name).slice(0, 100),
  };
  const managed = await managedThings(client, guild.id);
  return JSON.stringify({ server, zaru: zaruSummary(settings), ...managed, channels, categories, roles, members, bot: guild.members.me?.displayName ?? "ZARU" });
}

/** what ZARU keeps for this server, so "remove the mkbhd feed" or "why was Rahul warned" can be answered */
async function managedThings(client: KnoxClient, guildId: string) {
  const db = client.db;
  const safe = <T>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [cases, feeds, posts, tags, responses, stickies, active] = await Promise.all([
    safe(db.select({ n: modCases.caseNumber, type: modCases.type, target: modCases.targetId, by: modCases.moderatorId, reason: modCases.reason, at: modCases.createdAt }).from(modCases).where(eq(modCases.guildId, guildId)).orderBy(desc(modCases.caseNumber)).limit(15)),
    safe(db.select({ id: feedSubscriptions.id, kind: feedSubscriptions.kind, label: feedSubscriptions.label, source: feedSubscriptions.source, channelId: feedSubscriptions.channelId }).from(feedSubscriptions).where(eq(feedSubscriptions.guildId, guildId)).limit(20)),
    safe(db.select({ id: scheduledPosts.id, repeat: scheduledPosts.repeat, atUtc: scheduledPosts.atUtc, channelId: scheduledPosts.channelId, content: scheduledPosts.content }).from(scheduledPosts).where(eq(scheduledPosts.guildId, guildId)).limit(10)),
    safe(db.select({ name: customTags.name }).from(customTags).where(eq(customTags.guildId, guildId)).limit(40)),
    safe(db.select({ trigger: autoResponses.trigger, match: autoResponses.match }).from(autoResponses).where(eq(autoResponses.guildId, guildId)).limit(40)),
    safe(db.select({ channelId: stickyMessages.channelId }).from(stickyMessages).where(eq(stickyMessages.guildId, guildId)).limit(20)),
    safe(db.select({ id: giveaways.id, prize: giveaways.prize, channelId: giveaways.channelId, endsAt: giveaways.endsAt }).from(giveaways).where(and(eq(giveaways.guildId, guildId), eq(giveaways.ended, false))).limit(5)),
  ]);
  return {
    recentCases: cases.map((c) => ({ case: c.n, type: c.type, target: c.target, by: c.by, reason: c.reason.slice(0, 80), at: c.at.toISOString().slice(0, 10) })),
    feeds: feeds.map((f) => ({ kind: f.kind, label: f.label, source: f.source, channelId: f.channelId })),
    scheduledPosts: posts.map((p) => ({ id: p.id, repeat: p.repeat, atUtc: p.atUtc, channelId: p.channelId, text: p.content.slice(0, 60) })),
    tags: tags.map((t) => t.name),
    autoResponses: responses.map((r) => ({ trigger: r.trigger, match: r.match })),
    stickyChannelIds: stickies.map((s) => s.channelId),
    activeGiveaways: active.map((g) => ({ prize: g.prize, channelId: g.channelId, endsAt: g.endsAt.toISOString() })),
  };
}
