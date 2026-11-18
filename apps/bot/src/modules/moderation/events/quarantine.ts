// Keeps a quarantine in force outside the command: the state is loaded at start-up, someone who left comes
// back quarantined, and a channel made later is hidden from the role too.
import { Events, type GuildMember, type NonThreadGuildBasedChannel } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { isQuarantined, quarantineRoleOf } from "../../../lib/role-guard.js";
import { hideNewChannel, loadQuarantineState, requarantineOnJoin } from "../lib/quarantine.js";

export const quarantineReadyEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const client = args[0] as KnoxClient;
    await loadQuarantineState(client).catch((err) => logger.warn({ err }, "quarantine state could not be loaded"));
  },
};

export const quarantineJoinEvent: KnoxBoundEvent = {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    const member = args[0] as GuildMember;
    if (!isQuarantined(member.guild.id, member.id)) return;
    await requarantineOnJoin(member.client as KnoxClient, member);
  },
};

export const quarantineChannelEvent: KnoxBoundEvent = {
  name: Events.ChannelCreate,
  async execute(...args: unknown[]) {
    const channel = args[0] as NonThreadGuildBasedChannel;
    if (!channel.guild || !quarantineRoleOf(channel.guild.id)) return;
    await hideNewChannel(channel.client as KnoxClient, channel);
  },
};
