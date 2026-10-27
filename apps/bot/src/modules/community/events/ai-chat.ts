// AI chat channel: in the one channel set as features.aiChatChannelId, ZARU answers every message conversationally —
// general questions or questions about this server/channel — no prefix needed. Admin actions still need "ZARU, ..." or /zaru.
import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { aiProvider } from "../../../lib/ai-moderation.js";
import { conversationalReply, recentConversation } from "../../../lib/assistant/chat.js";
import { extractInstruction } from "../../admin/events/assistant.js";
import { logger } from "../../../logger.js";

const cooldown = new Map<string, number>();
const COOLDOWN_MS = 3_000;

export const aiChatEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.content.trim()) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    if (message.channelId !== cached.settings.features.aiChatChannelId) return;

    // let commands and admin instructions fall through to their own handlers
    const prefix = cached.settings.features.commandPrefix || "?";
    if (message.content.startsWith(prefix)) return;
    if (extractInstruction(message.content, client.user?.id)) return;
    if (!aiProvider()) return; // no key: stay quiet rather than nag every message

    const key = `${message.channelId}:${message.author.id}`;
    if (Date.now() - (cooldown.get(key) ?? 0) < COOLDOWN_MS) return;
    cooldown.set(key, Date.now());

    const guild = message.guild;
    const channel = message.channel;
    if (!channel.isTextBased() || channel.isDMBased()) return;

    try {
      await channel.sendTyping().catch(() => undefined);
      const reply = await conversationalReply({
        client,
        guild,
        channel,
        speaker: message.member?.displayName ?? message.author.username,
        text: message.content,
        prefix,
        conversation: await recentConversation(client, channel, message.id),
      });
      if (!reply) return;
      await message.reply({ content: reply.slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } });
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, "ai chat failed");
    }
  },
};
