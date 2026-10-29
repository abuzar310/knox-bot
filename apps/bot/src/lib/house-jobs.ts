// Timed work that is not a Discord event: delayed roles, channels that clear themselves, free-game posts.
import type { TextChannel } from "discord.js";
import type { KnoxClient } from "../client.js";
import { persistGuildSettings } from "../config/save-settings.js";
import { knoxEmbed } from "../interactions/embed.js";
import { logger } from "../logger.js";
import { CHEAPSHARK_FREE_URL, parseCheapSharkDeals, unseenGames } from "./free-games.js";
import { duePurges } from "./scheduled-purge.js";
import { canGrantRole } from "./roles.js";

let freeGamesCheckedAt = 0;

export async function runDelayedRoles(client: KnoxClient) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    const pending = cached.settings.features.pendingDelayedRoles;
    const due = pending.filter((row) => Date.parse(row.dueAt) <= now);
    if (!due.length) continue;
    const keep = pending.filter((row) => Date.parse(row.dueAt) > now);
    await persistGuildSettings(client, guild.id, {
      ...cached.settings,
      features: { ...cached.settings.features, pendingDelayedRoles: keep },
    });
    for (const row of due) {
      const member = await guild.members.fetch(row.userId).catch(() => null);
      const role = guild.roles.cache.get(row.roleId);
      if (!member || !canGrantRole(role) || member.roles.cache.has(row.roleId)) continue;
      await member.roles.add(role, "Delayed role").catch(() => undefined);
    }
  }
}

export async function runScheduledPurges(client: KnoxClient) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    const rows = cached.settings.features.scheduledPurges;
    const due = new Set(duePurges(rows, now));
    if (!due.size) continue;
    const stamped = new Date(now).toISOString();
    await persistGuildSettings(client, guild.id, {
      ...cached.settings,
      features: {
        ...cached.settings.features,
        scheduledPurges: rows.map((row) => (due.has(row.channelId) ? { ...row, lastRunAt: stamped } : row)),
      },
    });
    for (const channelId of due) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
      const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (!messages?.size) continue;
      const young = messages.filter((message) => !message.pinned && now - message.createdTimestamp < 14 * 86_400_000);
      await (channel as TextChannel).bulkDelete(young, true).catch((err) => logger.debug({ err }, "scheduled purge failed"));
    }
  }
}

export async function postSelfRoleDrafts(client: KnoxClient) {
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    const draft = cached.settings.features.selfRoleDraft;
    if (!draft) continue;
    const channel = await guild.channels.fetch(draft.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await persistGuildSettings(client, guild.id, {
        ...cached.settings,
        features: { ...cached.settings.features, selfRoleDraft: null },
      }).catch(() => undefined);
      continue;
    }
    const lines = draft.pairs.map((pair) => `${pair.emoji} <@&${pair.roleId}>`).join("\n");
    const message = await channel
      .send({
        embeds: [knoxEmbed(cached.settings.embedColor).setTitle(draft.title).setDescription(`${draft.mode}\n\n${lines}`)],
        allowedMentions: { parse: [] },
      })
      .catch(() => null);
    if (!message) continue;
    const emojiRolePanels = [
      ...cached.settings.features.emojiRolePanels,
      {
        messageId: message.id,
        channelId: draft.channelId,
        mode: draft.mode,
        durationMinutes: draft.durationMinutes,
        requiredRoleId: null,
        pairs: draft.pairs,
      },
    ].slice(-15);
    const saved = await persistGuildSettings(client, guild.id, {
      ...cached.settings,
      features: { ...cached.settings.features, selfRoleDraft: null, emojiRolePanels },
    })
      .then(() => true)
      .catch((err) => {
        logger.warn({ err }, "self-role draft could not be saved");
        return false;
      });
    if (!saved) {
      await message.delete().catch(() => undefined);
      continue;
    }
    for (const pair of draft.pairs) await message.react(pair.emoji).catch(() => undefined);
  }
}

export async function runFreeGames(client: KnoxClient) {
  if (Date.now() - freeGamesCheckedAt < 30 * 60_000) return;
  const interested = [...client.guilds.cache.values()].filter((guild) => {
    const id = client.guildConfig.peek(guild.id)?.settings.features.freeGamesChannelId;
    return Boolean(id);
  });
  if (!interested.length) return;
  freeGamesCheckedAt = Date.now();
  const res = await fetch(CHEAPSHARK_FREE_URL, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res?.ok) return;
  const games = parseCheapSharkDeals(await res.json().catch(() => null));
  if (!games.length) return;
  for (const guild of interested) {
    const cached = await client.guildConfig.get(guild.id);
    const channelId = cached.settings.features.freeGamesChannelId;
    if (!channelId) continue;
    const fresh = unseenGames(games, cached.settings.features.freeGamesSeen).slice(0, 3);
    if (!fresh.length) continue;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
    for (const game of fresh) {
      await channel
        .send({ content: `**${game.title}** is free.\n${game.url}`, allowedMentions: { parse: [] } })
        .catch(() => undefined);
    }
    const seen = [...fresh.map((game) => game.id), ...cached.settings.features.freeGamesSeen].slice(0, 60);
    await persistGuildSettings(client, guild.id, {
      ...cached.settings,
      features: { ...cached.settings.features, freeGamesSeen: seen },
    });
  }
}
