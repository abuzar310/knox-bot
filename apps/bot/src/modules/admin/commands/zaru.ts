import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { handleInstruction, mayCommand } from "../../../lib/assistant/run.js";
import { conversationalReply } from "../../../lib/assistant/chat.js";
import { NO_MOD_POWER, isModerationAsk } from "../../../lib/assistant/discord-perm.js";
import { describeAsker, resolveKnoxRank } from "../../../permissions/resolve.js";

export const zaruCommand: KnoxCommand = {
  moduleId: "admin",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("zaru")
    .setDescription("Ask ZARU in plain words. Admins only — members use the prefix.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("do").setDescription('e.g. "what can I play" or, for staff, "kick Rahul, spamming"').setRequired(true).setMaxLength(1500))
    .addAttachmentOption((o) => o.setName("file").setDescription("an image to use: for an emoji, the server icon, or a post").setRequired(false)),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
    const channel = interaction.channel;
    if (!member || !channel || !channel.isTextBased() || channel.isDMBased()) return;
    const text = interaction.options.getString("do", true);
    const staff = await mayCommand(ctx.client, member);
    if (!staff && isModerationAsk(text)) {
      await interaction.reply({ content: NO_MOD_POWER, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    if (staff) {
      const file = interaction.options.getAttachment("file");
      const result = await handleInstruction(ctx.client, member, channel, text, file ? [file.url] : []);
      await interaction.editReply(result);
      return;
    }
    const cached = await ctx.client.guildConfig.get(guild.id);
    const asker = describeAsker(member, resolveKnoxRank(member, cached.permissionRows));
    const reply = await conversationalReply({
      client: ctx.client,
      guild,
      channel,
      speaker: member.displayName,
      text,
      prefix: cached.settings.features.commandPrefix || "?",
      rank: asker.rank,
      roles: asker.roles,
      powers: asker.powers,
    });
    await interaction.editReply(reply?.slice(0, 1900) || "I didn't catch that.");
  },
};
