import { Events, type MessageReaction, type PartialMessageReaction, type User } from "discord.js";
import { and, eq } from "drizzle-orm";
import { starboardMap } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const starboardEvent: KnoxBoundEvent = {
  name: Events.MessageReactionAdd,
  async execute(...args: unknown[]) {
    const reaction = args[0] as MessageReaction | PartialMessageReaction;
    const user = args[1] as User;
    if (user.bot) return;
    if (reaction.emoji.name !== "⭐") return;
    const message = await reaction.message.fetch().catch(() => null);
    if (!message?.guild || message.author.bot) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    const f = cached.settings.features;
    if (!f.starboardEnabled || !f.starboardChannelId) return;
    if (message.channelId === f.starboardChannelId) return;
    const count = message.reactions.cache.get("⭐")?.count ?? 0;
    if (count < f.starboardMin) return;

    const board = await message.guild.channels.fetch(f.starboardChannelId).catch(() => null);
    if (!board || !board.isTextBased() || board.isDMBased()) return;

    const [existing] = await client.db
      .select()
      .from(starboardMap)
      .where(and(eq(starboardMap.guildId, message.guild.id), eq(starboardMap.sourceMessageId, message.id)))
      .limit(1);

    const embed = knoxEmbed(cached.settings.embedColor)
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(message.content?.slice(0, 1800) || "*attachment / embed*")
      .setFooter({ text: `⭐ ${count}` });

    if (existing) {
      const starMsg = await board.messages.fetch(existing.starMessageId).catch(() => null);
      if (starMsg) await starMsg.edit({ embeds: [embed] });
      return;
    }
    const sent = await board.send({ embeds: [embed], content: `${message.url}` });
    await client.db.insert(starboardMap).values({
      guildId: message.guild.id,
      sourceMessageId: message.id,
      starMessageId: sent.id,
    });
  },
};
