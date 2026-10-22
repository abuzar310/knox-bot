// Sticky notes, auto-thread channels, DISBOARD bump reminders and join anniversaries.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Guild, type GuildTextBasedChannel } from "discord.js";
import { eq } from "drizzle-orm";
import { stickyMessages } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { repostSticky } from "../lib/engagement.js";

const TEXT_LIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;
const MAX_AUTO_THREAD_CHANNELS = 20;

/** the real channel behind an option (or the current one), when ZARU can post there */
function resolveTextChannel(guild: Guild, id: string | undefined): GuildTextBasedChannel | null {
  const channel = id ? guild.channels.cache.get(id) : null;
  if (!channel || !channel.isTextBased() || channel.isThread()) return null;
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
  return channel;
}

export const stickyCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Keep a note at the bottom of a channel; it is re-posted after people write")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set or replace the sticky note")
        .addStringOption((o) => o.setName("message").setDescription("The note (markdown works)").setRequired(true).setMaxLength(1500))
        .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: this one)").addChannelTypes(...TEXT_LIKE)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove the sticky note")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: this one)").addChannelTypes(...TEXT_LIKE)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Channels with a sticky note")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const mine = [...client.stickies.entries()].filter(([, e]) => e.guildId === guild.id);
      await interaction.reply({
        content: mine.length ? `Sticky notes in: ${mine.map(([id]) => `<#${id}>`).join(", ")}` : "No sticky notes here yet. Try /sticky set.",
        ephemeral: true,
      });
      return;
    }
    const channel = resolveTextChannel(guild, interaction.options.getChannel("channel")?.id ?? interaction.channelId);
    if (!channel) {
      await interaction.reply({ content: "I can't post in that channel (or it's a thread).", ephemeral: true });
      return;
    }
    if (sub === "remove") {
      const entry = client.stickies.get(channel.id);
      if (!entry) {
        await interaction.reply({ content: `<#${channel.id}> has no sticky note.`, ephemeral: true });
        return;
      }
      const timer = client.stickyTimers.get(channel.id);
      if (timer) clearTimeout(timer);
      client.stickyTimers.delete(channel.id);
      client.stickies.delete(channel.id);
      await client.db.delete(stickyMessages).where(eq(stickyMessages.channelId, channel.id));
      if (entry.lastMessageId) await channel.messages.delete(entry.lastMessageId).catch(() => undefined);
      await interaction.reply({ content: `Sticky note removed from <#${channel.id}>.`, ephemeral: true });
      return;
    }
    const content = interaction.options.getString("message", true).trim();
    await interaction.deferReply({ ephemeral: true });
    const previous = client.stickies.get(channel.id);
    await client.db
      .insert(stickyMessages)
      .values({ channelId: channel.id, guildId: guild.id, content, createdBy: interaction.user.id })
      .onConflictDoUpdate({ target: stickyMessages.channelId, set: { content, createdBy: interaction.user.id } });
    await repostSticky(client, channel, { guildId: guild.id, content, lastMessageId: previous?.lastMessageId ?? null });
    await interaction.editReply(`Sticky note set in <#${channel.id}>. It moves back to the bottom a few seconds after people write.`);
  },
};

export const autoThreadCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("autothread")
    .setDescription("Open a thread under every post in a channel (showcases, help desks, suggestions)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Start threads under every post in a channel")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(...TEXT_LIKE).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop auto-threads in a channel")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(...TEXT_LIKE).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Auto-thread channels")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    const current = features.autoThreadChannelIds;
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      await interaction.reply({
        content: current.length ? `Auto-threads in: ${current.map((id) => `<#${id}>`).join(", ")}` : "No auto-thread channel yet. Try /autothread add.",
        ephemeral: true,
      });
      return;
    }
    const channel = interaction.options.getChannel("channel", true);
    const next = sub === "add" ? [...new Set([...current, channel.id])] : current.filter((id) => id !== channel.id);
    if (sub === "add" && next.length > MAX_AUTO_THREAD_CHANNELS) {
      await interaction.reply({ content: `Up to ${MAX_AUTO_THREAD_CHANNELS} auto-thread channels; remove one first.`, ephemeral: true });
      return;
    }
    const real = guild.channels.cache.get(channel.id);
    const me = guild.members.me;
    const canThread = real && me && !real.isThread() ? real.permissionsFor(me).has(PermissionFlagsBits.CreatePublicThreads) : false;
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, features: { ...features, autoThreadChannelIds: next } });
    await interaction.reply({
      content:
        sub === "add"
          ? `Every post in <#${channel.id}> gets its own thread, named after its first line.${canThread ? "" : " I need **Create Public Threads** there for it to work."}`
          : `Auto-threads are off in <#${channel.id}>.`,
      ephemeral: true,
    });
  },
};

export const bumpReminderCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("bumpreminder")
    .setDescription("Remind the server two hours after a DISBOARD bump")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("on")
        .setDescription("Switch bump reminders on")
        .addRoleOption((o) => o.setName("ping").setDescription("Role to ping when it's time to bump")),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Switch bump reminders off"))
    .addSubcommand((s) => s.setName("status").setDescription("Current setting")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    const sub = interaction.options.getSubcommand();
    if (sub === "status") {
      await interaction.reply({
        content: features.bumpReminderEnabled
          ? `Bump reminders are on${features.bumpReminderRoleId ? `, pinging <@&${features.bumpReminderRoleId}>` : ""}. I watch for DISBOARD's "Bump done" and remind two hours later in the same channel.`
          : "Bump reminders are off. /bumpreminder on switches them on.",
        ephemeral: true,
      });
      return;
    }
    const enabled = sub === "on";
    const role = enabled ? interaction.options.getRole("ping") : null;
    await persistGuildSettings(ctx.client, guild.id, {
      ...cached.settings,
      features: { ...features, bumpReminderEnabled: enabled, bumpReminderRoleId: enabled ? (role?.id ?? features.bumpReminderRoleId) : features.bumpReminderRoleId },
    });
    await interaction.reply({
      content: enabled
        ? `Bump reminders are on${role ? `, pinging <@&${role.id}>` : ""}. After DISBOARD says "Bump done" I react ⏰ and remind two hours later in that channel.`
        : "Bump reminders are off.",
      ephemeral: true,
    });
  },
};

export const anniversariesCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("anniversaries")
    .setDescription("Celebrate members on the day they joined, every year")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Post anniversaries in a channel (08:00 UTC daily)")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(...TEXT_LIKE).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Stop posting anniversaries")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const sub = interaction.options.getSubcommand();
    const channelId = sub === "set" ? interaction.options.getChannel("channel", true).id : null;
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, features: { ...cached.settings.features, anniversaryChannelId: channelId } });
    const embed = knoxEmbed(cached.settings.embedColor).setDescription(
      channelId
        ? `Every day at 08:00 UTC, members who joined **${guild.name}** on that date a year or more ago are celebrated in <#${channelId}>.`
        : "Anniversary posts are off.",
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
