import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { loadAutoResponses, matchAutoResponse, renderReply } from "../lib/auto-responses.js";

/** the same trigger answers at most once per channel in this window */
const COOLDOWN_MS = 10_000;

export const autoResponseSweepEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    await loadAutoResponses(args[0] as KnoxClient);
  },
};

export const autoResponseEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.content) return;
    const client = message.client as KnoxClient;
    const rows = client.autoResponses.get(message.guild.id);
    if (!rows?.length) return;
    const hit = matchAutoResponse(message.content, rows);
    if (!hit) return;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const key = `${message.channelId}:${hit.id}`;
    const now = Date.now();
    if (now - (client.autoResponseCooldown.get(key) ?? 0) < COOLDOWN_MS) return;
    client.autoResponseCooldown.set(key, now);
    await message
      .reply({ content: renderReply(hit.reply, message.member, `${message.author}`, message.author.username, message.guild.name), allowedMentions: { users: [message.author.id] } })
      .catch(() => undefined);
  },
};
