// Member changes worth a log line: nicknames and roles (the join/leave lines live in members.ts).
import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logLine } from "../../moderation/lib/modlog.js";

export const memberUpdateLog: KnoxBoundEvent = {
  name: Events.GuildMemberUpdate,
  async execute(...args: unknown[]) {
    const before = args[0] as GuildMember | PartialGuildMember;
    const after = args[1] as GuildMember;
    if (before.partial) return;
    const client = after.client as KnoxClient;
    const cached = await client.guildConfig.get(after.guild.id);
    if (!cached.settings.moduleFlags.community || !cached.settings.features.logMembers) return;
    const lines: string[] = [];
    if (before.nickname !== after.nickname) {
      lines.push(`Nickname: ${before.nickname ? `"${before.nickname}"` : "*(none)*"} → ${after.nickname ? `"${after.nickname}"` : "*(none)*"}`);
    }
    const added = after.roles.cache.filter((r) => !before.roles.cache.has(r.id)).map((r) => `<@&${r.id}>`);
    const removed = before.roles.cache.filter((r) => !after.roles.cache.has(r.id)).map((r) => `<@&${r.id}>`);
    if (added.length) lines.push(`Roles added: ${added.join(", ")}`);
    if (removed.length) lines.push(`Roles removed: ${removed.join(", ")}`);
    if (!lines.length) return;
    await logLine(after.guild, cached.settings, "Member updated", `${after.user.tag} (${after.id})\n${lines.join("\n")}`, 0x5865f2, "members");
  },
};
