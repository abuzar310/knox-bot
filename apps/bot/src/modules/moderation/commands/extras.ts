// Everyday moderation tools: clear a channel, slow it down, lock it, and bans that undo themselves.
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { createCase } from "../lib/cases.js";
import { formatDuration, parseDuration } from "../lib/duration.js";
import { canModerate, logLine, notifyTarget, protectedBlock, sendModLog } from "../lib/modlog.js";
import { askYesNo } from "../lib/yes-no.js";

const TEXT_LIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread] as const;

/** the channel an option named, or the one the command ran in, as long as it is a server text channel */
function targetChannel(interaction: Parameters<KnoxCommand["execute"]>[0]): GuildTextBasedChannel | null {
  const picked = interaction.options.getChannel("channel");
  const ch = picked ? interaction.guild?.channels.cache.get(picked.id) : interaction.channel;
  if (!ch || !ch.isTextBased() || ch.isDMBased()) return null;
  return ch as GuildTextBasedChannel;
}

export const purgeCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("How many recent messages to look through (1-100)").setMinValue(1).setMaxValue(100).setRequired(true),
    )
    .addUserOption((o) => o.setName("user").setDescription("Only this member's messages"))
    .addStringOption((o) => o.setName("contains").setDescription("Only messages containing this text").setMaxLength(100)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const channel = targetChannel(interaction);
    if (!channel) return;
    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");
    const contains = interaction.options.getString("contains")?.toLowerCase();
    const scope = `${user ? ` from ${user.tag}` : ""}${contains ? ` containing "${contains}"` : ""}`;
    await askYesNo(interaction, `Delete up to **${amount}** message${amount === 1 ? "" : "s"} in <#${channel.id}>${scope}?`, async () => {
      const fetched = await channel.messages.fetch({ limit: amount });
      const cutoff = Date.now() - 14 * 24 * 3_600_000;
      const targets = fetched.filter(
        (m) =>
          !m.pinned &&
          m.createdTimestamp > cutoff &&
          (!user || m.author.id === user.id) &&
          (!contains || m.content.toLowerCase().includes(contains)),
      );
      const n = targets.size ? (await channel.bulkDelete(targets, true)).size : 0;
      await logLine(interaction.guild!, ctx.settings, "Messages purged", `${interaction.user.tag} deleted ${n} in <#${channel.id}>${scope}`);
      return { content: `Deleted **${n}** message${n === 1 ? "" : "s"}${scope}.` };
    }, ctx.settings?.embedColor);
  },
};

export const slowmodeCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set how often members can post in a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o.setName("seconds").setDescription("Seconds between messages (0 turns it off, up to 21600)").setMinValue(0).setMaxValue(21_600).setRequired(true),
    )
    .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: this one)").addChannelTypes(...TEXT_LIKE)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const channel = targetChannel(interaction);
    if (!channel || !("setRateLimitPerUser" in channel)) {
      await interaction.reply({ content: "That channel can't have slowmode.", ephemeral: true });
      return;
    }
    const seconds = interaction.options.getInteger("seconds", true);
    await channel.setRateLimitPerUser(seconds, `slowmode by ${interaction.user.tag}`);
    const text = seconds ? `Slowmode in <#${channel.id}>: one message every **${formatDuration(seconds * 1000)}**.` : `Slowmode off in <#${channel.id}>.`;
    await interaction.reply({ content: text });
    await logLine(interaction.guild, ctx.settings, "Slowmode changed", `${interaction.user.tag}: ${text}`);
  },
};

async function setLocked(interaction: Parameters<KnoxCommand["execute"]>[0], ctx: Parameters<KnoxCommand["execute"]>[1], locked: boolean) {
  if (!interaction.guild) return;
  const channel = targetChannel(interaction);
  if (!channel || !("permissionOverwrites" in channel)) {
    await interaction.reply({ content: "That channel can't be locked.", ephemeral: true });
    return;
  }
  const reason = interaction.options.getString("reason") ?? "";
  const value = locked ? false : null; // null = back to whatever the role normally allows
  await channel.permissionOverwrites.edit(
    interaction.guild.roles.everyone,
    { SendMessages: value, SendMessagesInThreads: value, AddReactions: value },
    { reason: `${locked ? "locked" : "unlocked"} by ${interaction.user.tag}${reason ? `: ${reason}` : ""}` },
  );
  const line = `${locked ? "🔒 Locked" : "🔓 Unlocked"} by ${interaction.user.tag}${reason ? ` — ${reason}` : ""}`;
  await interaction.reply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setDescription(line)] });
  await logLine(interaction.guild, ctx.settings, locked ? "Channel locked" : "Channel unlocked", `<#${channel.id}>: ${line}`);
}

export const lockCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Stop everyone from posting in a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: this one)").addChannelTypes(...TEXT_LIKE))
    .addStringOption((o) => o.setName("reason").setDescription("Why").setMaxLength(200)),
  execute: (interaction, ctx) => setLocked(interaction, ctx, true),
};

export const unlockCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Let everyone post in a channel again")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel (default: this one)").addChannelTypes(...TEXT_LIKE))
    .addStringOption((o) => o.setName("reason").setDescription("Why").setMaxLength(200)),
  execute: (interaction, ctx) => setLocked(interaction, ctx, false),
};

export const tempbanCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("tempban")
    .setDescription("Ban a member for a while; ZARU lifts the ban when the time is up")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) => o.setName("duration").setDescription("e.g. 1h, 3d, 2w").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setMaxLength(500))
    .addIntegerOption((o) => o.setName("delete_days").setDescription("Delete message history (0-7 days)").setMinValue(0).setMaxValue(7)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const durationMs = parseDuration(interaction.options.getString("duration", true));
    if (!durationMs) {
      await interaction.reply({ content: "Bad duration. Use formats like `1h`, `3d`, `2w`.", ephemeral: true });
      return;
    }
    const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const shielded = protectedBlock(member, ctx.settings?.features.protectedRoleIds);
      if (shielded) {
        await interaction.reply({ content: shielded, ephemeral: true });
        return;
      }
      const blocked = canModerate(moderator, member);
      if (blocked) {
        await interaction.reply({ content: blocked, ephemeral: true });
        return;
      }
      if (!member.bannable) {
        await interaction.reply({ content: "I can't ban that member.", ephemeral: true });
        return;
      }
    }
    await askYesNo(interaction, `Temp-ban **${user.tag}** for **${formatDuration(durationMs)}**?\n${reason}`, async () => {
      if (member) await notifyTarget(user, interaction.guild!, "banned", reason, durationMs);
      try {
        await interaction.guild!.members.ban(user.id, { reason: `${reason} (temporary, ${formatDuration(durationMs)})`, deleteMessageSeconds: deleteDays * 86_400 });
      } catch (error) {
        throw new Error(`Ban failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      const modCase = await createCase(ctx.client.db, {
        guildId: interaction.guild!.id,
        type: "ban",
        targetId: user.id,
        moderatorId: interaction.user.id,
        reason,
        durationMs,
        active: true,
      });
      await sendModLog(interaction.guild!, ctx.settings, {
        title: "Member temporarily banned",
        caseNumber: modCase.caseNumber,
        action: "tempban",
        target: user,
        moderator: interaction.user,
        reason,
        durationMs,
        color: 0xd7263d,
      });
      return {
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Temporarily banned")
            .setDescription(`${user.tag} banned for **${formatDuration(durationMs)}** · case **#${modCase.caseNumber}**\n${reason}`),
        ],
      };
    }, ctx.settings?.embedColor);
  },
};
