import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { createCase } from "../lib/cases.js";
import { ownerRolePeerBan } from "../../../lib/assistant/owner-mod.js";
import { canModerate, notifyTarget, protectedBlock, sendModLog } from "../lib/modlog.js";
import { askYesNo } from "../lib/yes-no.js";

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
      o.setName("reason").setDescription("Reason").setRequired(false).setMaxLength(500),
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
      const peerBan = ownerRolePeerBan(moderator.id, member, interaction.guild.ownerId);
      const shielded = protectedBlock(member, ctx.settings?.features.protectedRoleIds);
      if (shielded && !peerBan) {
        await interaction.reply({ content: shielded, ephemeral: true });
        return;
      }
      const blocked = canModerate(moderator, member);
      const hierarchy = blocked === "You can't moderate someone with an equal or higher role.";
      if (blocked && !(peerBan && hierarchy)) {
        await interaction.reply({ content: blocked, ephemeral: true });
        return;
      }
      if (!member.bannable) {
        await interaction.reply({ content: "I can't ban that member.", ephemeral: true });
        return;
      }
    }

    await askYesNo(interaction, `Ban **${user.tag}**?\n${reason}`, async () => {
      if (member) await notifyTarget(user, interaction.guild!, "banned", reason);
      try {
        await interaction.guild!.members.ban(user.id, {
          reason,
          deleteMessageSeconds: deleteDays * 24 * 60 * 60,
        });
      } catch (error) {
        throw new Error(`Ban failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      const modCase = await createCase(ctx.client.db, {
        guildId: interaction.guild!.id,
        type: "ban",
        targetId: user.id,
        moderatorId: interaction.user.id,
        reason,
        active: true,
      });
      await sendModLog(interaction.guild!, ctx.settings, {
        title: "Member banned",
        caseNumber: modCase.caseNumber,
        action: "ban",
        target: user,
        moderator: interaction.user,
        reason,
        color: 0xd7263d,
      });
      return {
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Banned")
            .setDescription(`${user.tag} banned · case **#${modCase.caseNumber}**\n${reason}`),
        ],
      };
    }, ctx.settings?.embedColor);
  },
};
