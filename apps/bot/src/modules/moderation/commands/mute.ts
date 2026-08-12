import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { createCase, deactivateActiveMutes } from "../lib/cases.js";
import { formatDuration, parseDuration } from "../lib/duration.js";
import { canModerate, sendModLog } from "../lib/modlog.js";

export const muteCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("duration")
        .setDescription("e.g. 10m, 1h, 1d")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user", true);
    const durationRaw = interaction.options.getString("duration", true);
    const reason =
      interaction.options.getString("reason") ?? "No reason provided";
    const durationMs = parseDuration(durationRaw);

    if (!durationMs) {
      await interaction.reply({
        content: "Bad duration. Use formats like `10m`, `1h`, `2d` (max 28d).",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    if (!member) {
      await interaction.reply({ content: "Member not found.", ephemeral: true });
      return;
    }

    const blocked = canModerate(moderator, member);
    if (blocked) {
      await interaction.reply({ content: blocked, ephemeral: true });
      return;
    }

    await member.timeout(durationMs, reason);
    await deactivateActiveMutes(ctx.client.db, interaction.guild.id, user.id);

    const modCase = await createCase(ctx.client.db, {
      guildId: interaction.guild.id,
      type: "mute",
      targetId: user.id,
      moderatorId: interaction.user.id,
      reason,
      durationMs,
      active: true,
    });

    await sendModLog(interaction.guild, ctx.settings, {
      title: "Member muted",
      caseNumber: modCase.caseNumber,
      action: "mute",
      target: user,
      moderator: interaction.user,
      reason,
      durationMs,
      color: 0xff8a4c,
    });

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Muted")
          .setDescription(
            `${user} muted for **${formatDuration(durationMs)}** · case **#${modCase.caseNumber}**\n${reason}`,
          ),
      ],
    });
  },
};
