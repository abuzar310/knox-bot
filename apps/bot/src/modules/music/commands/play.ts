import {
  ChannelType,
  SlashCommandBuilder,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";

export const playCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a direct audio/radio URL in your voice channel")
    .addStringOption((o) =>
      o.setName("url").setRequired(true).setDescription("Direct mp3/ogg/radio stream URL"),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voice = member.voice.channel;
    if (!voice || voice.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      return;
    }
    const url = interaction.options.getString("url", true);
    if (!/^https?:\/\//i.test(url)) {
      await interaction.reply({
        content: "Paste a direct audio URL (mp3/ogg/radio). YouTube needs Lavalink later.",
        ephemeral: true,
      });
      return;
    }
    const queue = ctx.client.music.get(interaction.guild.id) ?? { urls: [], playing: false };
    queue.urls.push(url);
    ctx.client.music.set(interaction.guild.id, queue);
    await interaction.reply({
      content: `Queued in **${voice.name}**. Direct streams play when a Lavalink/ffmpeg node is attached. Saved **${queue.urls.length}** track(s). Use \`/skip\` / \`/stop\`.`,
    });
  },
};

export const skipCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const queue = ctx.client.music.get(interaction.guild.id);
    queue?.urls.shift();
    await interaction.reply({ content: queue?.urls.length ? "Skipped." : "Queue empty." });
  },
};

export const stopCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("stop").setDescription("Clear the music queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    ctx.client.music.delete(interaction.guild.id);
    await interaction.reply({ content: "Queue cleared." });
  },
};

export const queueCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const queue = ctx.client.music.get(interaction.guild.id);
    await interaction.reply({
      content: queue?.urls.length
        ? queue.urls.map((u, i) => `**${i + 1}.** ${u}`).join("\n").slice(0, 1900)
        : "Queue is empty.",
    });
  },
};
