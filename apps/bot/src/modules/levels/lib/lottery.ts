// A rolling server lottery: members buy tickets with coins into a shared pot, and on a timer ZARU draws one
// weighted-random winner, pays the whole pot, and starts the next round. If nobody entered, the pot rolls over.
import { and, eq, lte } from "drizzle-orm";
import { lotteries, lotteryTickets } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { addWallet } from "../../../lib/xp.js";
import { logger } from "../../../logger.js";

export const MAX_TICKETS = 100;

export function nextDraw(intervalHours: number, from = new Date()): Date {
  return new Date(from.getTime() + intervalHours * 3_600_000);
}

/** pick a winner by ticket weight; pure, so the odds are testable */
export function pickWinner(entries: { userId: string; tickets: number }[], roll: number): string | null {
  const total = entries.reduce((sum, e) => sum + e.tickets, 0);
  if (total <= 0) return null;
  let target = Math.floor(roll * total);
  for (const e of entries) {
    target -= e.tickets;
    if (target < 0) return e.userId;
  }
  return entries[entries.length - 1]?.userId ?? null;
}

/** run every tick: draw any lottery whose time is up */
export async function runLotteryDraws(client: KnoxClient) {
  const due = await client.db.select().from(lotteries).where(lte(lotteries.drawAt, new Date())).catch(() => []);
  for (const row of due) {
    // claim the draw by pushing drawAt forward first, so a slow draw can't run twice
    const claimed = await client.db
      .update(lotteries)
      .set({ drawAt: nextDraw(row.intervalHours) })
      .where(and(eq(lotteries.guildId, row.guildId), lte(lotteries.drawAt, new Date())))
      .returning({ guildId: lotteries.guildId });
    if (!claimed.length) continue;
    await drawOne(client, row.guildId, row.pot, row.channelId).catch((err) => logger.warn({ err, guildId: row.guildId }, "lottery draw failed"));
  }
}

async function drawOne(client: KnoxClient, guildId: string, pot: number, channelId: string | null) {
  const entries = await client.db.select({ userId: lotteryTickets.userId, tickets: lotteryTickets.tickets }).from(lotteryTickets).where(eq(lotteryTickets.guildId, guildId));
  const announce = async (text: string) => {
    if (!channelId) return;
    const guild = client.guilds.cache.get(guildId);
    const channel = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (channel?.isTextBased() && !channel.isDMBased()) await channel.send({ content: text, allowedMentions: { parse: ["users"] } }).catch(() => undefined);
  };

  if (!entries.length || pot <= 0) {
    if (pot > 0) await announce(`🎟️ Lottery drawn: nobody bought a ticket, so **${pot}** coins roll over to the next round.`);
    return; // pot stays (drawAt already advanced); tickets already empty
  }

  const winner = pickWinner(entries, Math.random());
  await client.db.delete(lotteryTickets).where(eq(lotteryTickets.guildId, guildId));
  await client.db.update(lotteries).set({ pot: 0 }).where(eq(lotteries.guildId, guildId));
  if (!winner) return;
  const wallet = await addWallet(client.db, guildId, winner, pot);
  const totalTickets = entries.reduce((s, e) => s + e.tickets, 0);
  const odds = Math.round(((entries.find((e) => e.userId === winner)?.tickets ?? 0) / totalTickets) * 100);
  await announce(`🎉 **Lottery!** <@${winner}> won the **${pot}** coin jackpot with a ${odds}% chance (wallet **${wallet}**). A new round starts now — \`/lottery buy\` to enter.`);
}
