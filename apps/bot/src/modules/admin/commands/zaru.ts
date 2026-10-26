import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { handleInstruction, mayCommand } from "../../../lib/assistant/run.js";

export const zaruCommand: KnoxCommand = {
  moduleId: "admin",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("zaru")
    .setDescription("Tell ZARU what to do in plain words: channels, roles, kicks, timeouts, messages…")
    .addStringOption((o) => o.setName("do").setDescription('e.g. "create a private channel for the Mods role" or "kick Rahul, spamming"').setRequired(true).setMaxLength(1500)),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
    const channel = interaction.channel;
    if (!member || !channel || !channel.isTextBased() || channel.isDMBased()) return;
    if (!(await mayCommand(ctx.client, member))) {
      await interaction.reply({ content: "Only staff can give me instructions.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const result = await handleInstruction(ctx.client, member, channel, interaction.options.getString("do", true));
    await interaction.editReply(result);
  },
};
