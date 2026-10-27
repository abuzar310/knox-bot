// AI chat channel: in the one channel set as features.aiChatChannelId, ZARU answers every message conversationally —
// general questions or questions about this server/channel — no prefix needed. Admin actions still need "ZARU, ..." or /zaru.
import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { askText } from "../../../lib/ai-json.js";
import { aiProvider } from "../../../lib/ai-moderation.js";
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
      // a little recent history for continuity
      const recent = await channel.messages.fetch({ limit: 8 }).catch(() => null);
      const history = recent
        ? [...recent.values()]
            .reverse()
            .filter((m) => m.id !== message.id && m.content.trim())
            .slice(-6)
            .map((m) => `${m.author.bot ? "ZARU" : m.member?.displayName ?? m.author.username}: ${m.content.slice(0, 300)}`)
            .join("\n")
        : "";
      const chName = "name" in channel ? channel.name : "this channel";
      const topic = "topic" in channel && channel.topic ? ` (topic: ${channel.topic.slice(0, 120)})` : "";
      const facts = `Server: ${guild.name}. Members: ${guild.memberCount}. You are in the #${chName} channel${topic}.`;
      const system =
        `You are ZARU, a friendly Discord bot and the assistant for "${guild.name}". You are chatting in #${chName}. ` +
        "Answer the person helpfully and conversationally in the SAME language they use (they often use Hindi or Hinglish). Keep it short, 1 to 4 sentences, unless they ask for detail. " +
        "You can answer general-knowledge questions and questions about this server or channel. " +
        "If they want you to actually DO something on the server (make a channel, give a role, kick someone, change a setting), tell them to start their message with \"ZARU,\" or use /zaru — only that performs real actions. " +
        `Facts you can rely on: ${facts}`;
      const user = history ? `Recent chat:\n${history}\n\n${message.member?.displayName ?? message.author.username}: ${message.content.slice(0, 500)}` : message.content.slice(0, 500);

      const answer = await askText(system, user, 500);
      if (!answer) return;
      await message.reply({ content: answer.slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } });
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, "ai chat failed");
    }
  },
};
