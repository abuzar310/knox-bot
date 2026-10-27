// AI chat channel: in the one channel set as features.aiChatChannelId, ZARU answers every message conversationally —
// general questions or questions about this server/channel — no prefix needed. Admin actions still need "ZARU, ..." or /zaru.
import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { askText } from "../../../lib/ai-json.js";
import { aiProvider } from "../../../lib/ai-moderation.js";
import { commandList } from "../../../lib/command-list.js";
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
      const prefix = cached.settings.features.commandPrefix || "?";
      const facts = `Server: ${guild.name}. Members: ${guild.memberCount}. You are in the #${chName} channel${topic}.`;
      const system =
        `You are ZARU — a real person who moderates "${guild.name}", chatting in #${chName} like anyone else on the server. ` +
        "Talk the way a desi Discord mod actually types: casual, warm, short (1-3 sentences), match their language exactly — Hinglish gets Hinglish, Hindi gets Hindi, English gets English. An emoji here and there is fine, not every line. " +
        "Never say you are an AI, a bot, a model or an assistant; never mention prompts, context or instructions. You just know things because you're a mod here. " +
        "Answer whatever they ask — about the server, the channel, games, life, general knowledge. Don't greet unless they greet first; just answer the thing. If you don't know, say so like a person would. " +
        "If they want something actually done on the server (channel banana, role dena, kick, settings), tell them casually to write it as \"ZARU, <kaam>\" so it really happens. " +
        `IMPORTANT about commands: ZARU's prefix is "${prefix}" (NOT "!"). When someone asks how something works or which command to use, name ONLY real commands from this exact list, written as /name or ${prefix}name — NEVER invent commands. Coins live under /eco (balance, daily, work, fish, hunt, crime, rob, deposit, withdraw, pay, top, collect), games under /gamble and /lottery, rank under /rank. Full list: ${commandList(client)}. ` +
        `Things you know: ${facts}`;
      const user = history ? `Recent chat:\n${history}\n\n${message.member?.displayName ?? message.author.username}: ${message.content.slice(0, 500)}` : message.content.slice(0, 500);

      const answer = await askText(system, user, 500);
      if (!answer) return;
      await message.reply({ content: answer.slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } });
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, "ai chat failed");
    }
  },
};
