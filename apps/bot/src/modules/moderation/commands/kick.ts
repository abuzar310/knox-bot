import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { createCase } from "../lib/cases.js";
import { canModerate, sendModLog } from "../lib/modlog.js";

export const kickCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const moderator = await interaction.guild.members.fetch(interaction.user.id);

    if (!member) {
      await interaction.reply({ content: "Member not found.", ephemeral: true });
      return;
    }
    if (!member.kickable) {
      await interaction.reply({ content: "I can't kick that member.", ephemeral: true });
      return;
    }

    const blocked = canModerate(moderator, member);
    if (blocked) {
      await interaction.reply({ content: blocked, ephemeral: true });
      return;
    }

    const modCase = await createCase(ctx.client.db, {
      guildId: interaction.guild.id,
      type: "kick",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      active: false,
    });

    await member.kick(reason);
    await sendModLog(interaction.guild, ctx.settings, {
      title: "Member kicked",
      caseNumber: modCase.caseNumber,
      action: "kick",
      target: user,
      moderator: interaction.user,
      reason,
      color: 0xff6b6b,
    });

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Kicked")
          .setDescription(`${user.tag} kicked · case **#${modCase.caseNumber}**\n${reason}`),
      ],
    });
  },
};
