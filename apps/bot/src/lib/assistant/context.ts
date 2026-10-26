// What the model gets to see about the server: enough to name every channel, role and member by exact id, plus the
// facts a staff member might ask about (members, boosts, verification, who is in voice) and ZARU's own settings.
import { ChannelType, GuildVerificationLevel, type Guild } from "discord.js";
import type { GuildSettings } from "@knox/config";
import { plainName } from "../server-brain.js";
import { zaruSummary } from "./settings-map.js";

const MAX_MEMBERS = 300;

export async function serverContext(guild: Guild, settings: GuildSettings) {
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
  };
  return JSON.stringify({ server, zaru: zaruSummary(settings), channels, categories, roles, members, bot: guild.members.me?.displayName ?? "ZARU" });
}
