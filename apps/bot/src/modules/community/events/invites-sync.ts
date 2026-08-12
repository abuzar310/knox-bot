import { Events, type Invite } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { snapshotGuildInvites } from "../lib/invites.js";

export const readyInvitesEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const client = args[0] as KnoxClient;
    for (const guild of client.guilds.cache.values()) {
      await snapshotGuildInvites(client, guild.id);
    }
  },
};

export const inviteCreateEvent: KnoxBoundEvent = {
  name: Events.InviteCreate,
  async execute(...args: unknown[]) {
    const invite = args[0] as Invite;
    if (!invite.guild) return;
    const client = invite.client as KnoxClient;
    const map = client.inviteCache.get(invite.guild.id) ?? new Map<string, number>();
    map.set(invite.code, invite.uses ?? 0);
    client.inviteCache.set(invite.guild.id, map);
  },
};

export const inviteDeleteEvent: KnoxBoundEvent = {
  name: Events.InviteDelete,
  async execute(...args: unknown[]) {
    const invite = args[0] as Invite;
    if (!invite.guild) return;
    const client = invite.client as KnoxClient;
    client.inviteCache.get(invite.guild.id)?.delete(invite.code);
  },
};
