import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { and, eq } from "drizzle-orm";
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
        ),
    )
    .addSubcommand((s) => s.setName("end").setDescription("End the giveaway in this channel now")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "start") {
      const prize = interaction.options.getString("prize", true);
      const duration = parseDuration(interaction.options.getString("duration", true));
      if (!duration) {
        await interaction.reply({ content: "Duration like `10m`, `1h`, or `1d`.", ephemeral: true });
        return;
      }
      const winnerCount = interaction.options.getInteger("winners") ?? 1;
      const endsAt = new Date(Date.now() + duration);
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Giveaway")
            .setDescription(`**${prize}**\nWinners: **${winnerCount}**\nEnds <t:${Math.floor(endsAt.getTime() / 1000)}:R>`)
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
