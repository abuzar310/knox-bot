import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { fixedName } from "../../../lib/decancer.js";
import { logLine } from "../lib/modlog.js";

async function autoClean(member: GuildMember, why: string) {
  if (member.user.bot) return;
  const client = member.client as KnoxClient;
  const cached = await client.guildConfig.get(member.guild.id);
  if (!cached.settings.moduleFlags.moderation || !cached.settings.moderation.autoDecancer) return;
  const next = fixedName(member.displayName);
  if (!next || !member.manageable) return;
  const before = member.displayName;
  await member.setNickname(next, `Auto decancer (${why})`).catch(() => undefined);
  await logLine(member.guild, cached.settings, "Nickname cleaned", `<@${member.id}>: "${before}" → "${next}" (${why})`);
}

export const decancerJoinEvent: KnoxBoundEvent = {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    await autoClean(args[0] as GuildMember, "on join");
  },
};

export const decancerRenameEvent: KnoxBoundEvent = {
  name: Events.GuildMemberUpdate,
  async execute(...args: unknown[]) {
    const before = args[0] as GuildMember | PartialGuildMember;
    const after = args[1] as GuildMember;
    if (before.nickname === after.nickname) return;
    await autoClean(after, "after a rename");
  },
};
