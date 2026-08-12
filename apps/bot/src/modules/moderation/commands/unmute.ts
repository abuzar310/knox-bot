import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { createCase, deactivateActiveMutes } from "../lib/cases.js";
import { sendModLog } from "../lib/modlog.js";

export const unmuteCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove a member timeout")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
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
    if (!member) {
      await interaction.reply({ content: "Member not found.", ephemeral: true });
      return;
    }

    await member.timeout(null, reason);
    await deactivateActiveMutes(ctx.client.db, interaction.guild.id, user.id);

    const modCase = await createCase(ctx.client.db, {
      guildId: interaction.guild.id,
      type: "unmute",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      active: false,
    });

    await sendModLog(interaction.guild, ctx.settings, {
      title: "Member unmuted",
      caseNumber: modCase.caseNumber,
      action: "unmute",
      target: user,
      moderator: interaction.user,
      reason,
      color: 0x6dd37c,
    });

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Unmuted")
          .setDescription(`${user} unmuted · case **#${modCase.caseNumber}**`),
      ],
    });
  },
};
