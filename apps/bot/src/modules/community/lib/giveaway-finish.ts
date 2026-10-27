import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { eq } from "drizzle-orm";
import { giveaways } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export async function finishGiveaway(client: KnoxClient, id: number) {
  const [row] = await client.db.select().from(giveaways).where(eq(giveaways.id, id)).limit(1);
  if (!row || row.ended) return;
  await client.db.update(giveaways).set({ ended: true }).where(eq(giveaways.id, id));
  // entries may list a user more than once (bonus-role weighting), so pick from the raw pool
  // and strip every copy of a winner so no one can win twice
  const pool = [...row.entries];
  const winners: string[] = [];
  while (winners.length < row.winnerCount && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    const picked = pool[i]!;
    winners.push(picked);
    for (let j = pool.length - 1; j >= 0; j--) if (pool[j] === picked) pool.splice(j, 1);
  }
  const guild = client.guilds.cache.get(row.guildId);
  const channel = guild ? await guild.channels.fetch(row.channelId).catch(() => null) : null;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const text = winners.length
    ? winners.map((id) => `<@${id}>`).join(", ")
    : "Nobody joined.";
  // winners are pinged in the message text (mentions inside an embed never notify anyone)
  await channel.send({
    content: winners.length ? `🎉 ${text} won **${row.prize}**!` : undefined,
    allowedMentions: { users: winners },
    embeds: [
      knoxEmbed()
        .setTitle("Giveaway ended")
        .setDescription(`**${row.prize}**\nWinners: ${text}`),
    ],
  });
  // the Join button on the original post goes grey so nobody taps a finished giveaway
  const original = await channel.messages.fetch(row.messageId).catch(() => null);
  await original
    ?.edit({
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("knox:giveaway:ended").setLabel("Ended").setStyle(ButtonStyle.Secondary).setDisabled(true),
        ),
      ],
    })
    .catch(() => undefined);
}
