import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue } from "../../../lib/player-queue.js";
import { musicPanelPayload, upsertMusicPanel } from "../../../lib/music-panel.js";
import { playErrorMessage } from "../../../lib/music-session.js";
import { youtubeSearch, type KnoxTrack } from "../../../lib/youtube.js";

export const SEARCH_PREFIX = "knox:search:";

const pending = new Map<string, { tracks: KnoxTrack[]; at: number }>();

function voiceChannel(member: GuildMember | null): VoiceBasedChannel | null {
  const channel = member?.voice.channel;
  if (!channel) return null;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
    return null;
  }
  return channel;
}

function fmt(seconds: number) {
  if (!seconds) return "?:??";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const searchCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search YouTube and pick a track to play or add to the queue")
    .addStringOption((o) =>
      o.setName("query").setRequired(true).setDescription("Song name or artist"),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!voiceChannel(member)) {
      await interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const query = interaction.options.getString("query", true);
    const tracks = await youtubeSearch(query, 8);
    if (!tracks.length) {
      await interaction.editReply({ content: "No tracks found." });
      return;
    }
    pending.set(interaction.user.id, { tracks, at: Date.now() });
    setTimeout(() => pending.delete(interaction.user.id), 5 * 60_000);

    const embed = knoxEmbed(ctx.settings?.embedColor)
      .setTitle(`Search: ${query}`)
      .setDescription("Pick a track. If something is already playing, it goes on the queue.")
      .addFields(
        tracks.map((track, i) => ({
          name: `${i + 1}. ${track.title.slice(0, 80)}`,
          value: `${track.artist} · ${fmt(track.duration)}`,
          inline: false,
        })),
      );

    const row1 = new ActionRowBuilder<ButtonBuilder>();
    const row2 = new ActionRowBuilder<ButtonBuilder>();
    tracks.forEach((_, i) => {
      const btn = new ButtonBuilder()
        .setCustomId(`${SEARCH_PREFIX}pick:${i}`)
        .setLabel(String(i + 1))
        .setStyle(ButtonStyle.Secondary);
      if (i < 4) row1.addComponents(btn);
      else row2.addComponents(btn);
    });
    row1.addComponents(
      new ButtonBuilder().setCustomId(`${SEARCH_PREFIX}cancel`).setLabel("Cancel").setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({
      embeds: [embed],
      components: row2.components.length ? [row1, row2] : [row1],
    });
  },
};

export async function handleSearchButton(interaction: ButtonInteraction, client: KnoxClient) {
  if (interaction.customId === `${SEARCH_PREFIX}cancel`) {
    pending.delete(interaction.user.id);
    await interaction.update({ content: "Search cancelled.", embeds: [], components: [] });
    return;
  }
  const match = interaction.customId.match(/^knox:search:pick:(\d+)$/);
  if (!match || !interaction.guild) {
    await interaction.reply({ content: "That search expired.", ephemeral: true });
    return;
  }
  const stored = pending.get(interaction.user.id);
  if (!stored || Date.now() - stored.at > 5 * 60_000) {
    pending.delete(interaction.user.id);
    await interaction.update({ content: "Search expired. Run `/search` again.", embeds: [], components: [] });
    return;
  }
  const track = stored.tracks[Number(match[1])];
  if (!track) {
    await interaction.reply({ content: "That pick is gone.", ephemeral: true });
    return;
  }
  pending.delete(interaction.user.id);

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const channel = voiceChannel(member);
  if (!channel) {
    await interaction.update({ content: "Join a voice channel first.", embeds: [], components: [] });
    return;
  }
  const me = interaction.guild.members.me;
  if (me) {
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
      await interaction.update({ content: "I need Connect and Speak in that voice channel.", embeds: [], components: [] });
      return;
    }
  }
  const manager = client.music;
  if (!manager) {
    await interaction.update({ content: "Music is still starting.", embeds: [], components: [] });
    return;
  }

  const existing = guildQueue(client, interaction.guild.id);
  await interaction.update({ content: `Queuing **${track.title}**…`, embeds: [], components: [] });
  try {
    const session = manager.getOrCreate(interaction.guild, channel, {
      textChannelId: existing?.meta.textChannelId ?? interaction.channelId,
      color: existing?.meta.color,
      panelMessageId: existing?.meta.panelMessageId,
    });
    const played = await session.addAndPlay([{ ...track, requestedBy: interaction.user.username }]);
    if (played.alreadyPlaying) {
      await interaction.followUp({ content: `Added **${track.title}** to the queue.`, ephemeral: true });
      await upsertMusicPanel(session);
      return;
    }
    if (!session.current) {
      await interaction.followUp({ content: "Could not play that.", ephemeral: true });
      return;
    }
    if (interaction.channel?.isTextBased() && !interaction.channel.isDMBased()) {
      const sent = await interaction.channel.send(musicPanelPayload(session));
      session.meta.panelMessageId = sent.id;
      session.meta.textChannelId = interaction.channelId;
    }
  } catch (error) {
    await interaction.followUp({ content: playErrorMessage(error), ephemeral: true }).catch(() => undefined);
  }
}
