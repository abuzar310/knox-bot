// "ZARU, …" or "@ZARU …" at the start of a message from a staff member is an instruction.
import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { handleInstruction, mayCommand } from "../../../lib/assistant/run.js";

export function extractInstruction(content: string, botId: string | undefined): string | null {
  const trimmed = content.trim();
  const mention = botId ? new RegExp(`^<@!?${botId}>[,:\\s]*`) : null;
  if (mention && mention.test(trimmed)) return trimmed.replace(mention, "").trim() || null;
  const word = trimmed.match(/^zaru[,:!]?\s+(.+)$/is);
  return word ? (word[1] ?? "").trim() || null : null;
}

export const assistantEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.member) return;
    const client = message.client as KnoxClient;
    const instruction = extractInstruction(message.content, client.user?.id);
    if (!instruction || instruction.length < 3) return;
    const channel = message.channel;
    if (!channel.isTextBased() || channel.isDMBased()) return;
    if (!(await mayCommand(client, message.member))) return;
    try {
      await channel.sendTyping().catch(() => undefined);
      const result = await handleInstruction(client, message.member, channel, instruction);
      await message.reply({ ...result, allowedMentions: { parse: [], repliedUser: false } });
    } catch (err) {
      logger.warn({ err, guildId: message.guild.id }, "assistant failed");
      await message.reply({ content: "That went wrong on my side. Try again or use /zaru.", allowedMentions: { repliedUser: false } }).catch(() => undefined);
    }
  },
};
