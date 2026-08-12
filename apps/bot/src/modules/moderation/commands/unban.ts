import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { createCase } from "../lib/cases.js";
import { sendModLog } from "../lib/modlog.js";

export const unbanCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by ID")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName("user_id").setDescription("Discord user snowflake").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const userId = interaction.options.getString("user_id", true).trim();
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await interaction.reply({ content: "That user is not banned.", ephemeral: true });
      return;
    }

    await interaction.guild.members.unban(userId, reason);

    const modCase = await createCase(ctx.client.db, {
      guildId: interaction.guild.id,
      type: "unban",
      targetId: userId,
      moderatorId: interaction.user.id,
      reason,
      active: false,
    });

    await sendModLog(interaction.guild, ctx.settings, {
      title: "Member unbanned",
      caseNumber: modCase.caseNumber,
      action: "unban",
      target: ban.user,
      moderator: interaction.user,
      reason,
      color: 0x6dd37c,
    });

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Unbanned")
          .setDescription(`${ban.user.tag} unbanned · case **#${modCase.caseNumber}**`),
      ],
    });
  },
};
