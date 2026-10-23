import { Events, PermissionFlagsBits, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { logger } from "../../../logger.js";
import { loadHighlights, matchHighlights } from "../lib/highlights.js";

/** no repeat DM to the same person within this long, and no DM about a channel they just wrote in */
const QUIET_MS = 5 * 60_000;
const MAX_DMS_PER_MESSAGE = 10;

export const highlightsSweepEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    await loadHighlights(args[0] as KnoxClient);
  },
};

export const highlightsEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot) return;
    const client = message.client as KnoxClient;
    const now = Date.now();
    client.lastSeen.set(`${message.guild.id}:${message.author.id}`, { channelId: message.channelId, at: now });
    const words = client.highlightWords.get(message.guild.id);
    if (!words?.size || !message.content) return;
    const hits = matchHighlights(message.content, words);
    if (!hits.size) return;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const channel = message.channel;
    if (!channel.isTextBased() || channel.isDMBased()) return;

    let sent = 0;
    for (const [userId, matched] of hits) {
      if (sent >= MAX_DMS_PER_MESSAGE) break;
      if (userId === message.author.id) continue;
      const key = `${message.guild.id}:${userId}`;
      if (now - (client.highlightCooldown.get(key) ?? 0) < QUIET_MS) continue;
      const seen = client.lastSeen.get(key);
      if (seen && seen.channelId === message.channelId && now - seen.at < QUIET_MS) continue;
      const member = message.guild.members.cache.get(userId) ?? (await message.guild.members.fetch(userId).catch(() => null));
      if (!member || !channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) continue;
      client.highlightCooldown.set(key, now);
      const embed = knoxEmbed(cached.settings.embedColor)
        .setTitle(`Highlight in ${message.guild.name}`)
        .setDescription(`**${message.member?.displayName ?? message.author.username}** in <#${message.channelId}>:\n> ${message.content.replace(/\n/g, "\n> ").slice(0, 600)}\n[Jump to message](${message.url})`)
        .setFooter({ text: `Matched: ${matched.join(", ")} · /highlight remove to stop` })
        .setTimestamp(message.createdAt);
      await member.send({ embeds: [embed] }).then(
        () => {
          sent++;
        },
        (err) => logger.debug({ err, userId }, "highlight DM failed"),
      );
    }
  },
};
