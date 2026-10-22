import { Events, type MessageReaction, type PartialMessageReaction, type User } from "discord.js";
import { and, eq } from "drizzle-orm";
import { starboardMap } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

/** bring the starboard in line with a message's current ⭐ count: post, update, or take down */
async function syncStar(reaction: MessageReaction | PartialMessageReaction, user: User) {
  if (user.bot) return;
  if (reaction.emoji.name !== "⭐") return;
  const message = await reaction.message.fetch().catch(() => null);
  if (!message?.guild || message.author.bot) return;
  const client = message.client as KnoxClient;
  const cached = await client.guildConfig.get(message.guild.id);
  if (!cached.settings.moduleFlags.community) return;
  const f = cached.settings.features;
  if (!f.starboardEnabled || !f.starboardChannelId) return;
  if (message.channelId === f.starboardChannelId) return;
  const count = message.reactions.cache.get("⭐")?.count ?? 0;

  const board = await message.guild.channels.fetch(f.starboardChannelId).catch(() => null);
  if (!board || !board.isTextBased() || board.isDMBased()) return;

  const [existing] = await client.db
    .select()
    .from(starboardMap)
    .where(and(eq(starboardMap.guildId, message.guild.id), eq(starboardMap.sourceMessageId, message.id)))
    .limit(1);

  if (count < f.starboardMin) {
    // stars taken back below the bar: the board entry comes down
    if (existing) {
      const starMsg = await board.messages.fetch(existing.starMessageId).catch(() => null);
      await starMsg?.delete().catch(() => undefined);
      await client.db
        .delete(starboardMap)
        .where(and(eq(starboardMap.guildId, message.guild.id), eq(starboardMap.sourceMessageId, message.id)));
    }
    return;
  }

  const embed = knoxEmbed(cached.settings.embedColor)
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content?.slice(0, 1800) || "*attachment / embed*")
    .setFooter({ text: `⭐ ${count}` });
  const image = message.attachments.find((a) => a.contentType?.startsWith("image/"));
  if (image) embed.setImage(image.url);

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
}

export const starboardEvent: KnoxBoundEvent = {
  name: Events.MessageReactionAdd,
  async execute(...args: unknown[]) {
    await syncStar(args[0] as MessageReaction | PartialMessageReaction, args[1] as User);
  },
};

export const starboardRemoveEvent: KnoxBoundEvent = {
  name: Events.MessageReactionRemove,
  async execute(...args: unknown[]) {
    await syncStar(args[0] as MessageReaction | PartialMessageReaction, args[1] as User);
  },
};
