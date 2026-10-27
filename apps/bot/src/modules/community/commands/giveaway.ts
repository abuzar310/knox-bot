import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { giveaways } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { parseDuration } from "../../moderation/lib/duration.js";

export const GIVEAWAY_JOIN_ID = "knox:giveaway:join";

export const giveawayCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Run a giveaway")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start a giveaway")
        .addStringOption((o) => o.setName("prize").setRequired(true).setDescription("Prize"))
        .addStringOption((o) => o.setName("duration").setRequired(true).setDescription("e.g. 10m, 1h, 1d"))
        .addIntegerOption((o) =>
          o.setName("winners").setDescription("Winner count").setMinValue(1).setMaxValue(20),
        )
        .addRoleOption((o) => o.setName("required-role").setDescription("Only members with this role can enter"))
        .addRoleOption((o) => o.setName("bonus-role").setDescription("Members with this role get extra entries"))
        .addIntegerOption((o) =>
          o.setName("bonus-entries").setDescription("Extra entries for the bonus role (default 1)").setMinValue(1).setMaxValue(10),
        )
        .addIntegerOption((o) =>
          o.setName("min-account-age").setDescription("Minimum account age in days (anti-alt)").setMinValue(1).setMaxValue(3650),
        ),
    )
    .addSubcommand((s) => s.setName("end").setDescription("End the giveaway in this channel now"))
    .addSubcommand((s) => s.setName("reroll").setDescription("Pick a new winner for the last giveaway in this channel")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "reroll") {
      const [last] = await ctx.client.db
        .select()
        .from(giveaways)
        .where(and(eq(giveaways.guildId, interaction.guild.id), eq(giveaways.channelId, interaction.channelId), eq(giveaways.ended, true)))
        .orderBy(desc(giveaways.endsAt))
        .limit(1);
      if (!last) {
        await interaction.reply({ content: "No finished giveaway in this channel to reroll.", ephemeral: true });
        return;
      }
      const pool = [...new Set(last.entries)];
      if (!pool.length) {
        await interaction.reply({ content: `Nobody had joined **${last.prize}**, so there is nobody to pick.`, ephemeral: true });
        return;
      }
      const winner = pool[Math.floor(Math.random() * pool.length)]!;
      await interaction.reply({ content: `🎉 Reroll: <@${winner}> wins **${last.prize}**!`, allowedMentions: { users: [winner] } });
      return;
    }
    if (sub === "start") {
      const prize = interaction.options.getString("prize", true);
      const duration = parseDuration(interaction.options.getString("duration", true));
      if (!duration) {
        await interaction.reply({ content: "Duration like `10m`, `1h`, or `1d`.", ephemeral: true });
        return;
      }
      const winnerCount = interaction.options.getInteger("winners") ?? 1;
      const requiredRole = interaction.options.getRole("required-role");
      const bonusRole = interaction.options.getRole("bonus-role");
      const bonusEntries = bonusRole ? interaction.options.getInteger("bonus-entries") ?? 1 : 0;
      const minAccountDays = interaction.options.getInteger("min-account-age") ?? 0;
      const endsAt = new Date(Date.now() + duration);
      const reqLines: string[] = [];
      if (requiredRole) reqLines.push(`Must have <@&${requiredRole.id}>`);
      if (minAccountDays > 0) reqLines.push(`Account older than ${minAccountDays} day${minAccountDays === 1 ? "" : "s"}`);
      if (bonusRole && bonusEntries > 0)
        reqLines.push(`<@&${bonusRole.id}> gets +${bonusEntries} ${bonusEntries === 1 ? "entry" : "entries"}`);
      const reqBlock = reqLines.length ? `\n\n**Requirements**\n${reqLines.map((l) => `• ${l}`).join("\n")}` : "";
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Giveaway")
            .setDescription(`**${prize}**\nWinners: **${winnerCount}**\nEnds <t:${Math.floor(endsAt.getTime() / 1000)}:R>${reqBlock}`)
            .setFooter({ text: "Click Join to enter" }),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(GIVEAWAY_JOIN_ID).setLabel("Join").setStyle(ButtonStyle.Success),
          ),
        ],
      });
      const msg = await interaction.fetchReply();
      await ctx.client.db.insert(giveaways).values({
        guildId: interaction.guild.id,
        channelId: interaction.channelId,
        messageId: msg.id,
        prize,
        winnerCount,
        hostId: interaction.user.id,
        endsAt,
        entries: [],
        requiredRoleId: requiredRole?.id ?? null,
        bonusRoleId: bonusRole?.id ?? null,
        bonusEntries,
        minAccountDays,
      });
      return;
    }
    const [row] = await ctx.client.db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.guildId, interaction.guild.id),
          eq(giveaways.channelId, interaction.channelId),
          eq(giveaways.ended, false),
        ),
      )
      .limit(1);
    if (!row) {
      await interaction.reply({ content: "No active giveaway in this channel.", ephemeral: true });
      return;
    }
    const { finishGiveaway } = await import("../lib/giveaway-finish.js");
    await finishGiveaway(ctx.client, row.id);
    await interaction.reply({ content: "Giveaway ended.", ephemeral: true });
  },
};
