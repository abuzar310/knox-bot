import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { tickets } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

export const TICKET_OPEN_ID = "knox:ticket:open";
export const TICKET_CLOSE_ID = "knox:ticket:close";
export const TICKET_CLAIM_ID = "knox:ticket:claim";

export const ticketCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("panel")
        .setDescription("Post a ticket button")
        .addChannelOption((o) =>
          o
            .setName("category")
            .setDescription("Category for new tickets")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("close").setDescription("Close this ticket")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "panel") {
      const category = interaction.options.getChannel("category", true);
      await persistGuildSettings(ctx.client, interaction.guild.id, {
        ...ctx.settings,
        features: { ...ctx.settings.features, ticketCategoryId: category.id },
      });
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings.embedColor)
            .setTitle("Need help?")
            .setDescription("Click below to open a private ticket with staff."),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(TICKET_OPEN_ID)
              .setLabel("Open ticket")
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      });
      return;
    }
    const [row] = await ctx.client.db
      .select()
      .from(tickets)
      .where(
        and(eq(tickets.guildId, interaction.guild.id), eq(tickets.channelId, interaction.channelId), eq(tickets.open, true)),
      )
      .limit(1);
    if (!row) {
      await interaction.reply({ content: "This is not an open ticket.", ephemeral: true });
      return;
    }
    await ctx.client.db.update(tickets).set({ open: false }).where(eq(tickets.id, row.id));
    await interaction.reply({ content: "Ticket closed. Channel will be deleted in 5s." });
    setTimeout(() => {
      interaction.channel?.delete("Knox ticket closed").catch(() => undefined);
    }, 5000);
  },
};
