// What the model gets to see about the server: enough to name every channel, role and member by exact id.
import { ChannelType, type Guild } from "discord.js";
import { plainName } from "../server-brain.js";

const MAX_MEMBERS = 300;

export async function serverContext(guild: Guild) {
  const channels = [...guild.channels.cache.values()]
    .filter((c) => !c.isThread() && c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({
      id: c.id,
      name: c.name,
      plain: plainName(c.name),
      kind: c.type === ChannelType.GuildVoice ? "voice" : c.type === ChannelType.GuildAnnouncement ? "announcement" : c.type === ChannelType.GuildText ? "text" : "other",
      category: c.parent?.name ?? null,
    }));
  const categories = [...guild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name }));
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, members: r.members.size, managed: r.managed }));
  if (guild.members.cache.size < Math.min(guild.memberCount, MAX_MEMBERS)) await guild.members.fetch({ limit: MAX_MEMBERS }).catch(() => undefined);
  const members = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot)
    .slice(0, MAX_MEMBERS)
    .map((m) => ({ id: m.id, username: m.user.username, display: m.displayName }));
  return JSON.stringify({ server: guild.name, channels, categories, roles, members, bot: guild.members.me?.displayName ?? "ZARU" });
}
