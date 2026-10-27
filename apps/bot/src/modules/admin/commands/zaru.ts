import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { handleInstruction, mayCommand } from "../../../lib/assistant/run.js";
import { conversationalReply } from "../../../lib/assistant/chat.js";

export const zaruCommand: KnoxCommand = {
  moduleId: "admin",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("zaru")
    .setDescription("Tell ZARU what to do in plain words: channels, roles, kicks, timeouts, messages…")
    .addStringOption((o) => o.setName("do").setDescription('e.g. "create a private channel for the Mods role" or "kick Rahul, spamming"').setRequired(true).setMaxLength(1500))
    .addAttachmentOption((o) => o.setName("file").setDescription("an image to use: for an emoji, the server icon, or a post").setRequired(false)),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
    const channel = interaction.channel;
    if (!member || !channel || !channel.isTextBased() || channel.isDMBased()) return;
    const text = interaction.options.getString("do", true);
    if (!(await mayCommand(ctx.client, member))) {
      // not staff: ZARU still talks, it just can't change the server from here
      await interaction.deferReply();
      const cached = await ctx.client.guildConfig.get(guild.id);
      const reply = await conversationalReply({ client: ctx.client, guild, channel, speaker: member.displayName, text, prefix: cached.settings.features.commandPrefix || "?" });
      await interaction.editReply(reply ? reply.slice(0, 1900) : "I'm here, but I can't think right now — try again in a minute.");
      return;
    }
    await interaction.deferReply();
    const file = interaction.options.getAttachment("file");
    const result = await handleInstruction(ctx.client, member, channel, text, file ? [file.url] : []);
    await interaction.editReply(result);
  },
};
