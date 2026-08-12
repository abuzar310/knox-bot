import { eq } from "drizzle-orm";
import { giveaways } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export async function finishGiveaway(client: KnoxClient, id: number) {
  const [row] = await client.db.select().from(giveaways).where(eq(giveaways.id, id)).limit(1);
  if (!row || row.ended) return;
  await client.db.update(giveaways).set({ ended: true }).where(eq(giveaways.id, id));
  const pool = [...new Set(row.entries)];
  const winners: string[] = [];
  while (winners.length < row.winnerCount && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(i, 1)[0]!);
  }
  const guild = client.guilds.cache.get(row.guildId);
  const channel = guild ? await guild.channels.fetch(row.channelId).catch(() => null) : null;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const text = winners.length
    ? winners.map((id) => `<@${id}>`).join(", ")
    : "Nobody joined.";
  await channel.send({
    embeds: [
      knoxEmbed()
        .setTitle("Giveaway ended")
        .setDescription(`**${row.prize}**\nWinners: ${text}`),
    ],
  });
}
