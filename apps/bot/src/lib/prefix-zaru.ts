// Members talk to ZARU with the prefix alone (? what can I play). ?zaru is optional.
import type { Message } from "discord.js";
import type { KnoxClient } from "../client.js";
import { conversationalReply, chatOnCooldown } from "./assistant/chat.js";
import { parseMusicAsk } from "./music-words.js";
import { runMusicAsk } from "./music-request.js";
import { NO_MOD_POWER, isModerationAsk } from "./assistant/discord-perm.js";
import { handleInstruction, mayCommand } from "./assistant/run.js";
import { describeAsker, resolveKnoxRank } from "../permissions/resolve.js";
import { knoxEmbed } from "../interactions/embed.js";
import { logger } from "../logger.js";

/** shown on a bare prefix — quick map of coins + games (UnbelievaBoat-style typing) */
export function prefixGamesHint(prefix: string, embedColor?: string) {
  const p = prefix || "?";
  return {
    embeds: [
      knoxEmbed(embedColor)
        .setTitle("Talk to ZARU")
        .setDescription(
          [
            `**Chat:** \`${p}play song\` or \`zaru play song\`. The ? is optional when you start with zaru.`,
            "",
            "**Coins (earn):**",
            `\`${p}daily\` · \`${p}work\` · \`${p}slut\` · \`${p}crime\` · \`${p}rob @user\` · \`${p}money\` · \`${p}deposit all\``,
            "",
            "**Casino (bet coins):**",
            `\`${p}slots\` · \`${p}bj\` · \`${p}roulette\` · \`${p}cf\` · \`${p}hl\` · \`${p}rr\``,
            "",
            "**More:**",
            `\`${p}chicken buy/fight\` · \`${p}animal buy/race\` · \`${p}lottery\` · \`${p}shop\` · \`/rank\``,
            "",
            "**Music:**",
            `\`${p}musicroom\` makes the 24/7 Music channel. Then \`${p}play song name\` in #music. The panel appears there.`,
            "",
            "**Party (free):**",
            `\`${p}fun rps\` · truth-or-dare · \`${p}help\` for everything`,
          ].join("\n"),
        ),
    ],
    allowedMentions: { parse: [] },
  };
}

export async function handlePrefixZaruChat(message: Message, client: KnoxClient, text: string) {
  if (!message.guild || !message.member) return;
  const channel = message.channel;
  if (!channel.isTextBased() || channel.isDMBased()) return;
  const trimmed = text.trim();
  const music = parseMusicAsk(trimmed);
  if (music) {
    const handled = await runMusicAsk(message, client, music);
    if (handled) return;
  }
  if (trimmed.length < 2) {
    const cached = await client.guildConfig.get(message.guild.id);
    await message.reply(prefixGamesHint(cached.settings.features.commandPrefix || "?", cached.settings.embedColor));
    return;
  }

  const staff = await mayCommand(client, message.member);
  if (!staff && isModerationAsk(trimmed)) {
    await message.reply({ content: NO_MOD_POWER, allowedMentions: { repliedUser: false } });
    return;
  }
  if (!staff && chatOnCooldown(channel.id, message.author.id)) return;

  try {
    if (staff) {
      const attachments = [...message.attachments.values()].map((a) => a.url);
      const result = await handleInstruction(client, message.member, channel, trimmed, attachments, message.id);
      await message.reply({ ...result, allowedMentions: { parse: [], repliedUser: false } });
      return;
    }
    const cached = await client.guildConfig.get(message.guild.id);
    const asker = describeAsker(message.member, resolveKnoxRank(message.member, cached.permissionRows));
    const reply = await conversationalReply({
      client,
      guild: message.guild,
      channel,
      speaker: message.member.displayName,
      text: trimmed,
      prefix: cached.settings.features.commandPrefix || "?",
      excludeId: message.id,
      rank: asker.rank,
      roles: asker.roles,
      powers: asker.powers,
    });
    if (reply) await message.reply({ content: reply.slice(0, 1900), allowedMentions: { parse: [], repliedUser: false } });
  } catch (err) {
    logger.warn({ err, guildId: message.guild.id }, "prefix zaru chat failed");
    await message.reply({ content: "That went wrong on my side. Try again.", allowedMentions: { repliedUser: false } }).catch(() => undefined);
  }
}
