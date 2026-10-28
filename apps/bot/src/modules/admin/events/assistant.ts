// "ZARU, …" or "@ZARU …": owner/admin/mod run actions; members chat or play — never change the server.
import { Events, type GuildTextBasedChannel, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { handleInstruction, mayCommand } from "../../../lib/assistant/run.js";
import { chatOnCooldown, conversationalReply } from "../../../lib/assistant/chat.js";
import { NO_MOD_POWER, isModerationAsk } from "../../../lib/assistant/discord-perm.js";
import { describeAsker, resolveKnoxRank } from "../../../permissions/resolve.js";

export function extractInstruction(content: string, botId: string | undefined): string | null {
  const trimmed = content.trim();
  const mention = botId ? new RegExp(`^<@!?${botId}>[,:\\s]*`) : null;
  if (mention && mention.test(trimmed)) return trimmed.replace(mention, "").trim() || null;
  const word = trimmed.match(/^zaru[,:!]?\s+(.+)$/is);
  return word ? (word[1] ?? "").trim() || null : null;
}

/** Discord shows "typing" for about 10 s; the model can take longer, so keep it alive until the answer is posted */
function keepTyping(channel: GuildTextBasedChannel) {
  void channel.sendTyping().catch(() => undefined);
  const timer = setInterval(() => void channel.sendTyping().catch(() => undefined), 8_000);
  return () => clearInterval(timer);
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
    const staff = await mayCommand(client, message.member);
    if (!staff && isModerationAsk(instruction)) {
      await message.reply({ content: NO_MOD_POWER, allowedMentions: { repliedUser: false } });
      return;
    }
    if (!staff && chatOnCooldown(channel.id, message.author.id)) return;
    const stopTyping = keepTyping(channel);
    try {
      if (staff) {
        const attachments = [...message.attachments.values()].map((a) => a.url);
        const result = await handleInstruction(client, message.member, channel, instruction, attachments, message.id);
        await message.reply({ ...result, allowedMentions: { parse: [], repliedUser: false } });
      } else {
        // any member can talk to ZARU and it just chats back; only staff can make it change the server
        const cached = await client.guildConfig.get(message.guild.id);
        const asker = describeAsker(message.member, resolveKnoxRank(message.member, cached.permissionRows));
        const reply = await conversationalReply({
          client,
          guild: message.guild,
          channel,
          speaker: message.member.displayName,
          text: instruction,
          prefix: cached.settings.features.commandPrefix || "?",
          excludeId: message.id,
          rank: asker.rank,
          roles: asker.roles,
          powers: asker.powers,
        });
        if (reply) await message.reply({ content: reply.slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } });
      }
    } catch (err) {
      logger.warn({ err, guildId: message.guild.id }, "assistant failed");
      await message.reply({ content: "That went wrong on my side. Try again.", allowedMentions: { repliedUser: false } }).catch(() => undefined);
    } finally {
      stopTyping();
    }
  },
};
