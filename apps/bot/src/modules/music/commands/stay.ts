// /stay: keep ZARU in one voice channel around the clock for this server (or turn that off).
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { releaseAlwaysVoice, setAlwaysVoice } from "../../../lib/always-voice.js";
import { keepAlwaysVoice } from "../../../lib/music-session.js";

export const stayCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("stay")
    .setDescription("Keep ZARU in a voice channel 24/7 for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("in")
        .setDescription("Pick the channel ZARU should never leave")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Voice channel").setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
        ),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Let ZARU leave voice when the music ends")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const sub = interaction.options.getSubcommand();
    const channel = sub === "in" ? interaction.options.getChannel("channel", true) : null;
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, alwaysVoiceChannelId: channel?.id ?? null },
    });
    setAlwaysVoice(interaction.guild.id, channel?.id ?? null);
    if (channel) {
      releaseAlwaysVoice(interaction.guild.id);
      void keepAlwaysVoice(ctx.client);
    }
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings.embedColor).setDescription(
          channel ? `ZARU will stay in <#${channel.id}> around the clock. Play something and it keeps the channel.` : "24/7 is off: ZARU leaves voice when the music ends.",
        ),
      ],
      ephemeral: true,
    });
  },
};
