// ?musicroom — Music voice channel in the voice category, 24/7, and a chat where the panel appears.
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { releaseAlwaysVoice, setAlwaysVoice } from "../../../lib/always-voice.js";
import { keepAlwaysVoice } from "../../../lib/music-session.js";
import { setupMusicRoom } from "../../../lib/music-room.js";

export const roomCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("room")
    .setDescription("Make a 24/7 Music voice channel and a chat where the play panel appears")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    await interaction.deferReply({ ephemeral: true });
    try {
      const { voice, text } = await setupMusicRoom(interaction.guild);
      await persistGuildSettings(ctx.client, interaction.guild.id, {
        ...ctx.settings,
        features: { ...ctx.settings.features, alwaysVoiceChannelId: voice.id, musicChannelId: text.id },
      });
      setAlwaysVoice(interaction.guild.id, voice.id);
      releaseAlwaysVoice(interaction.guild.id);
      await keepAlwaysVoice(ctx.client);
      await interaction.editReply({
        embeds: [
          knoxEmbed(ctx.settings.embedColor).setDescription(
            [
              `Music is <#${voice.id}> in the voice category. ZARU stays there.`,
              `Type in <#${text.id}>: \`?play song name\`, or just the song name. The panel appears in that channel.`,
            ].join("\n"),
          ),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not make the music room.";
      await interaction.editReply({ content: message });
    }
  },
};
