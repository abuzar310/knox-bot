import type { Collection, Invite } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";

export async function snapshotGuildInvites(client: KnoxClient, guildId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  try {
    const invites = await guild.invites.fetch();
    client.inviteCache.set(guildId, usesMap(invites));
  } catch (err) {
    logger.warn({ err, guildId }, "could not fetch invites — grant Manage Server");
  }
}

export function usesMap(invites: Collection<string, Invite>) {
  const map = new Map<string, number>();
  for (const invite of invites.values()) {
    map.set(invite.code, invite.uses ?? 0);
  }
  return map;
}

export async function detectInviter(client: KnoxClient, guildId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { inviterId: null as string | null, code: null as string | null };

  try {
    const invites = await guild.invites.fetch();
    const previous = client.inviteCache.get(guildId) ?? new Map<string, number>();
    let used: Invite | null = null;

    for (const invite of invites.values()) {
      const before = previous.get(invite.code) ?? 0;
      const after = invite.uses ?? 0;
      if (after > before) {
        used = invite;
        break;
      }
    }

    client.inviteCache.set(guildId, usesMap(invites));

    if (!used) {
      const vanity = await guild.fetchVanityData().catch(() => null);
      if (vanity?.code) {
        return { inviterId: "vanity", code: vanity.code };
      }
      return { inviterId: null, code: null };
    }

    return {
      inviterId: used.inviter?.id ?? null,
      code: used.code,
    };
  } catch (err) {
    logger.warn({ err, guildId }, "invite detect failed");
    return { inviterId: null, code: null };
  }
}
