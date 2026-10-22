// Staff answer suggestions: the original post is updated and the person who suggested it is told.
import { PermissionFlagsBits, SlashCommandBuilder, type SlashCommandSubcommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { suggestions } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";

const idOption = (s: SlashCommandSubcommandBuilder) =>
  s
    .addIntegerOption((o) => o.setName("number").setDescription("Suggestion number (shown on the post)").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("note").setDescription("A word for the author").setMaxLength(300));

export const suggestionCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("suggestion")
    .setDescription("Approve or deny a suggestion")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => idOption(s.setName("approve").setDescription("Mark a suggestion approved")))
    .addSubcommand((s) => idOption(s.setName("deny").setDescription("Mark a suggestion denied"))),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const approved = interaction.options.getSubcommand() === "approve";
    const number = interaction.options.getInteger("number", true);
    const note = interaction.options.getString("note") ?? "";
    const [row] = await ctx.client.db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.guildId, interaction.guild.id), eq(suggestions.id, number)))
      .limit(1);
    if (!row) {
      await interaction.reply({ content: `No suggestion #${number} here.`, ephemeral: true });
      return;
    }
    const status = approved ? "approved" : "denied";
    await ctx.client.db.update(suggestions).set({ status }).where(eq(suggestions.id, row.id));

    const author = await ctx.client.users.fetch(row.userId).catch(() => null);
    const embed = knoxEmbed(approved ? "#3ddc84" : "#ff5c5c")
      .setTitle(`Suggestion #${row.id} — ${approved ? "✅ Approved" : "❌ Denied"}`)
      .setDescription(row.content)
      .setFooter({ text: `${author?.username ?? "someone"} · ${status} by ${interaction.user.username}` });
    if (note) embed.addFields({ name: "Staff note", value: note });

    if (row.channelId && row.messageId) {
      const channel = await interaction.guild.channels.fetch(row.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const msg = await channel.messages.fetch(row.messageId).catch(() => null);
        await msg?.edit({ embeds: [embed] }).catch(() => undefined);
      }
    }
    await author
      ?.send({ content: `Your suggestion #${row.id} in **${interaction.guild.name}** was **${status}**${note ? `: ${note}` : "."}`, allowedMentions: { parse: [] } })
      .catch(() => undefined);
    await interaction.reply({ content: `Suggestion #${row.id} ${status}.`, ephemeral: true });
  },
};
