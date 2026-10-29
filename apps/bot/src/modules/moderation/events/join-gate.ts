// Turns away joins the server doesn't want: too-new accounts, no avatar, or anyone while raid mode is on; and
// switches raid mode on by itself when joins come in a burst.
import { Events, type GuildMember } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { joinGateMessage, joinVerdict } from "../../../lib/safety/join-gate.js";
import { logLine } from "../lib/modlog.js";
import { DEFAULT_RAID_MINUTES, enableRaidMode } from "../lib/raid.js";
import { logger } from "../../../logger.js";

const JOIN_WINDOW_MS = 60_000;

export const joinGateEvent: KnoxBoundEvent = {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    const member = args[0] as GuildMember;
    if (member.user.bot) return;
    const client = member.client as KnoxClient;
    const guild = member.guild;
    // the cached settings are read synchronously when possible, so the verdict is on record before the community
    // welcome handler (registered earlier) resumes after its own first await
    const cached = client.guildConfig.peek(guild.id) ?? (await client.guildConfig.get(guild.id));
    if (!cached.settings.moduleFlags.moderation) return;
    const mod = cached.settings.moderation;

    const now = Date.now();
    const joins = (client.joinTimes.get(guild.id) ?? []).filter((t) => now - t < JOIN_WINDOW_MS);
    joins.push(now);
    client.joinTimes.set(guild.id, joins);

    const verdict = joinVerdict(mod, { createdTimestamp: member.user.createdTimestamp, hasAvatar: Boolean(member.user.avatar), joinsLastMinute: joins.length, now });
    const burst = !mod.raidMode && mod.raidJoinsPerMinute > 0 && joins.length >= mod.raidJoinsPerMinute;
    const key = `${guild.id}:${member.id}`;
    if (verdict) {
      client.gatedJoins.add(key);
      setTimeout(() => client.gatedJoins.delete(key), JOIN_WINDOW_MS).unref();
    }
    if (burst) {
      await enableRaidMode(client, guild, DEFAULT_RAID_MINUTES, `${joins.length} joins within a minute`, true).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "raid mode could not be switched on"),
      );
    }
    if (!verdict) return;

    await member.send({ content: joinGateMessage(guild.name, verdict, mod.joinGateMinAccountAgeHours), allowedMentions: { parse: [] } }).catch(() => undefined);
    const ban = mod.joinGateAction === "ban";
    const removed = ban
      ? member.bannable
        ? await member.ban({ reason: `Join gate: ${verdict.detail}` }).then(() => true, () => false)
        : false
      : member.kickable
        ? await member.kick(`Join gate: ${verdict.detail}`).then(() => true, () => false)
        : false;
    const created = Math.floor(member.user.createdTimestamp / 1000);
    await logLine(
      guild,
      cached.settings,
      "Join gate",
      `${member.user.tag} (${member.id}) · ${verdict.detail} · account created <t:${created}:R> · ${removed ? (ban ? "banned" : "kicked") : "could not remove them (permission or role too high)"}`,
      0xff8a4c,
    );
  },
};
