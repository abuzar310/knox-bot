// /filter — live ffmpeg audio filters (bassboost, nightcore, slowed, 8D, karaoke) applied to the playing session.
// /playlist — save the current queue under a name and bring it back any day: save, play, list, delete.
import { PermissionFlagsBits, SlashCommandBuilder, type GuildMember, type VoiceBasedChannel } from "discord.js";
import { and, eq } from "drizzle-orm";
import { guildPlaylists } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue } from "../../../lib/player-queue.js";
import { AUDIO_FILTERS } from "../../../lib/music-session.js";
import { controlRefusal } from "../../../lib/voice-gate.js";
import type { KnoxTrack } from "../../../lib/youtube.js";

const FILTER_BLURB: Record<string, string> = {
  off: "back to normal",
  bassboost: "extra bass 🔊",
  nightcore: "faster + higher pitch ⚡",
  slowed: "slowed + reverb vibes 🌙",
  "8d": "circling around your head 🎧 (use headphones)",
  karaoke: "vocals cut — you sing 🎤",
};

export const filterCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Audio filter for the music: bassboost, nightcore, slowed, 8D, karaoke")
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("Which filter")
        .setRequired(true)
        .addChoices(...Object.keys(AUDIO_FILTERS).map((name) => ({ name: name === "off" ? "off (normal)" : name, value: name }))),
    ),
  async execute(interaction, ctx) {
    const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
    if (refusal) {
      await interaction.reply({ content: refusal, ephemeral: true });
      return;
    }
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing. `/play` something first.", ephemeral: true });
      return;
    }
    const name = interaction.options.getString("name", true);
    await interaction.deferReply();
    const applied = await session.setFilter(name);
    if (applied === "unknown") {
      await interaction.editReply("I don't know that filter.");
      return;
    }
    await interaction.editReply(
      name === "off" ? "🎚️ Filter off — normal sound." : `🎚️ **${name}** on — ${FILTER_BLURB[name] ?? ""}${applied === "next" ? " (from the next track)" : ""}`,
    );
  },
};

function memberVoice(member: GuildMember | null): VoiceBasedChannel | null {
  return member?.voice.channel ?? null;
}

const slug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);

export const playlistCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Save the queue as a playlist and play it back any time")
    .addSubcommand((s) => s.setName("save").setDescription("Save what's playing + the queue under a name").addStringOption((o) => o.setName("name").setDescription("Playlist name").setRequired(true).setMaxLength(40)))
    .addSubcommand((s) => s.setName("play").setDescription("Queue up a saved playlist").addStringOption((o) => o.setName("name").setDescription("Playlist name").setRequired(true).setMaxLength(40)))
    .addSubcommand((s) => s.setName("list").setDescription("This server's saved playlists"))
    .addSubcommand((s) => s.setName("delete").setDescription("Delete a saved playlist (yours, or Manage Server)").addStringOption((o) => o.setName("name").setDescription("Playlist name").setRequired(true).setMaxLength(40))),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const db = ctx.client.db;
    const guildId = interaction.guild.id;

    if (sub === "save") {
      const session = guildQueue(ctx.client, guildId);
      if (!session?.current && !session?.queue.length) {
        await interaction.reply({ content: "Nothing is playing and the queue is empty — nothing to save.", ephemeral: true });
        return;
      }
      const name = slug(interaction.options.getString("name", true));
      if (!name) {
        await interaction.reply({ content: "Give the playlist a real name.", ephemeral: true });
        return;
      }
      const tracks = [session.current, ...session.queue]
        .filter((t): t is KnoxTrack => Boolean(t))
        .slice(0, 100)
        .map((t) => ({ title: t.title, artist: t.artist, url: t.url, duration: t.duration, platform: t.platform, thumbnail: t.thumbnail }));
      await db
        .insert(guildPlaylists)
        .values({ guildId, name, ownerId: interaction.user.id, tracks })
        .onConflictDoUpdate({ target: [guildPlaylists.guildId, guildPlaylists.name], set: { tracks, ownerId: interaction.user.id } });
      await interaction.reply({ content: `💾 Saved **${name}** with ${tracks.length} song${tracks.length === 1 ? "" : "s"}. \`/playlist play name:${name}\` brings it back.` });
      return;
    }

    if (sub === "list") {
      const rows = await db.select().from(guildPlaylists).where(eq(guildPlaylists.guildId, guildId));
      if (!rows.length) {
        await interaction.reply({ content: "No saved playlists yet. Play some songs, then `/playlist save`.", ephemeral: true });
        return;
      }
      const lines = rows.map((r) => `**${r.name}** — ${r.tracks.length} songs · saved by <@${r.ownerId}>`);
      await interaction.reply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle(`Playlists (${rows.length})`).setDescription(lines.join("\n").slice(0, 4000))] });
      return;
    }

    if (sub === "delete") {
      const name = slug(interaction.options.getString("name", true));
      const [row] = await db.select().from(guildPlaylists).where(and(eq(guildPlaylists.guildId, guildId), eq(guildPlaylists.name, name))).limit(1);
      if (!row) {
        await interaction.reply({ content: `No playlist called **${name}**.`, ephemeral: true });
        return;
      }
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (row.ownerId !== interaction.user.id && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: `**${name}** belongs to <@${row.ownerId}>. Only they (or Manage Server) can delete it.`, ephemeral: true });
        return;
      }
      await db.delete(guildPlaylists).where(eq(guildPlaylists.id, row.id));
      await interaction.reply({ content: `🗑️ Deleted playlist **${name}**.` });
      return;
    }

    // play
    const name = slug(interaction.options.getString("name", true));
    const [row] = await db.select().from(guildPlaylists).where(and(eq(guildPlaylists.guildId, guildId), eq(guildPlaylists.name, name))).limit(1);
    if (!row || !row.tracks.length) {
      await interaction.reply({ content: `No playlist called **${name}**. \`/playlist list\` shows what's saved.`, ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = memberVoice(member);
    if (!channel) {
      await interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      return;
    }
    const manager = ctx.client.music;
    if (!manager) {
      await interaction.reply({ content: "Music is still starting. Try again in a few seconds.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const existing = guildQueue(ctx.client, guildId);
    const session = manager.getOrCreate(interaction.guild, channel, {
      textChannelId: existing?.meta.textChannelId ?? interaction.channelId,
      color: existing?.meta.color ?? ctx.settings?.embedColor,
      panelMessageId: existing?.meta.panelMessageId,
    });
    const tracks: KnoxTrack[] = row.tracks.map((t) => ({ ...t, platform: t.platform as KnoxTrack["platform"], requestedBy: interaction.user.username }));
    const played = await session.addAndPlay(tracks);
    await interaction.editReply(
      played.alreadyPlaying
        ? `▶️ Added playlist **${name}** (${tracks.length} songs) to the queue.`
        : `▶️ Playing playlist **${name}** — starting with **${played.preview.title}** (${tracks.length} songs).`,
    );
  },
};
