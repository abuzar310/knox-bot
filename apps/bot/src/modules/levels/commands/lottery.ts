// /lottery — buy tickets into the server coin pot; an admin starts it and sets the price, interval and channel.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq, sql } from "drizzle-orm";
import { lotteries, lotteryTickets } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { takeWallet } from "../../../lib/xp.js";
import { MAX_TICKETS, nextDraw, runLotteryDraws } from "../lib/lottery.js";

export const lotteryCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("lottery")
    .setDescription("The server lottery: buy tickets, win the coin pot")
    .addSubcommand((s) =>
      s
        .setName("buy")
        .setDescription("Buy lottery tickets with coins")
        .addIntegerOption((o) => o.setName("tickets").setDescription(`How many (1–${MAX_TICKETS})`).setRequired(true).setMinValue(1).setMaxValue(MAX_TICKETS)),
    )
    .addSubcommand((s) => s.setName("info").setDescription("Pot, ticket price and next draw"))
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start or re-configure the lottery (admin)")
        .addIntegerOption((o) => o.setName("ticket_price").setDescription("Coins per ticket (default 100)").setMinValue(1).setMaxValue(1_000_000))
        .addIntegerOption((o) => o.setName("interval_hours").setDescription("Hours between draws (default 24)").setMinValue(1).setMaxValue(720))
        .addChannelOption((o) => o.setName("channel").setDescription("Where to announce the winner").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((s) => s.setName("draw").setDescription("Draw the winner right now (admin)")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const db = ctx.client.db;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();
    const [lottery] = await db.select().from(lotteries).where(eq(lotteries.guildId, guildId)).limit(1);
    const stamp = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

    if (sub === "start") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({ content: "Manage Server is needed to set up the lottery.", ephemeral: true });
        return;
      }
      const price = interaction.options.getInteger("ticket_price") ?? lottery?.ticketPrice ?? 100;
      const interval = interaction.options.getInteger("interval_hours") ?? lottery?.intervalHours ?? 24;
      const channelId = interaction.options.getChannel("channel")?.id ?? lottery?.channelId ?? interaction.channelId;
      const drawAt = lottery?.drawAt && lottery.drawAt > new Date() ? lottery.drawAt : nextDraw(interval);
      await db
        .insert(lotteries)
        .values({ guildId, ticketPrice: price, intervalHours: interval, channelId, drawAt })
        .onConflictDoUpdate({ target: lotteries.guildId, set: { ticketPrice: price, intervalHours: interval, channelId } });
      await interaction.reply({ content: `🎟️ Lottery is on: **${price}** coins a ticket, drawn every **${interval}h** in <#${channelId}>. Next draw ${stamp(drawAt)}. Members buy with \`/lottery buy\`.` });
      return;
    }

    if (!lottery) {
      await interaction.reply({ content: sub === "info" ? "No lottery is running. An admin can start one with `/lottery start`." : "No lottery is running yet. Ask an admin to `/lottery start`.", ephemeral: true });
      return;
    }

    if (sub === "info") {
      const [mine] = await db.select().from(lotteryTickets).where(and(eq(lotteryTickets.guildId, guildId), eq(lotteryTickets.userId, interaction.user.id))).limit(1);
      const [sum] = await db.select({ total: sql<number>`coalesce(sum(${lotteryTickets.tickets}), 0)::int` }).from(lotteryTickets).where(eq(lotteryTickets.guildId, guildId));
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("🎟️ Server lottery")
            .setDescription(`**Pot:** ${lottery.pot} coins\n**Ticket:** ${lottery.ticketPrice} coins\n**Tickets sold:** ${sum?.total ?? 0}\n**Your tickets:** ${mine?.tickets ?? 0}\n**Next draw:** ${stamp(lottery.drawAt)}`),
        ],
      });
      return;
    }

    if (sub === "draw") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({ content: "Manage Server is needed to force a draw.", ephemeral: true });
        return;
      }
      await db.update(lotteries).set({ drawAt: new Date(0) }).where(eq(lotteries.guildId, guildId));
      await interaction.reply({ content: "🎲 Drawing now…" });
      await runLotteryDraws(ctx.client);
      return;
    }

    // buy
    const count = interaction.options.getInteger("tickets", true);
    const cost = count * lottery.ticketPrice;
    if (!(await takeWallet(db, guildId, interaction.user.id, cost))) {
      await interaction.reply({ content: `You need **${cost}** coins for ${count} ticket${count === 1 ? "" : "s"}. Check /eco balance.`, ephemeral: true });
      return;
    }
    await db
      .insert(lotteryTickets)
      .values({ guildId, userId: interaction.user.id, tickets: count })
      .onConflictDoUpdate({ target: [lotteryTickets.guildId, lotteryTickets.userId], set: { tickets: sql`${lotteryTickets.tickets} + ${count}` } });
    const [updated] = await db.update(lotteries).set({ pot: sql`${lotteries.pot} + ${cost}` }).where(eq(lotteries.guildId, guildId)).returning({ pot: lotteries.pot });
    const [mine] = await db.select().from(lotteryTickets).where(and(eq(lotteryTickets.guildId, guildId), eq(lotteryTickets.userId, interaction.user.id))).limit(1);
    await interaction.reply({ content: `🎟️ Bought **${count}** ticket${count === 1 ? "" : "s"} for **${cost}** coins. You now hold **${mine?.tickets ?? count}**. Pot is **${updated?.pot ?? cost}**, drawn ${stamp(lottery.drawAt)}.` });
  },
};
