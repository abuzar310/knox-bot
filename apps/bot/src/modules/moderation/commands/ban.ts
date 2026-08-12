import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { createCase } from "../lib/cases.js";
import { canModerate, sendModLog } from "../lib/modlog.js";

export const banCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("delete_days")
        .setDescription("Delete message history (0-7 days)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (member) {
      const blocked = canModerate(moderator, member);
      if (blocked) {
        await interaction.reply({ content: blocked, ephemeral: true });
        return;
      }
      if (!member.bannable) {
        await interaction.reply({ content: "I can't ban that member.", ephemeral: true });
        return;
      }
    }

    const modCase = await createCase(ctx.client.db, {
      guildId: interaction.guild.id,
      type: "ban",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      active: true,
    });

    await interaction.guild.members.ban(user.id, {
      reason,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });

    await sendModLog(interaction.guild, ctx.settings, {
      title: "Member banned",
      caseNumber: modCase.caseNumber,
      action: "ban",
      target: user,
      moderator: interaction.user,
      reason,
      color: 0xd7263d,
    });

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Banned")
          .setDescription(`${user.tag} banned · case **#${modCase.caseNumber}**\n${reason}`),
      ],
    });
  },
};
