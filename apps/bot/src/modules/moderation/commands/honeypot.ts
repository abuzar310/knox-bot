// /honeypot: the trap channel that catches spam bots (off until an admin sets it up).
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { TRAP_CHANNEL_NAME, TRAP_NOTICE, TRAP_TOPIC } from "../lib/honeypot-kit.js";

export const honeypotCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("A trap channel for spam bots: whoever writes in it is removed with their last day of messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // no "use this channel" option on purpose: arming a channel people talk in would remove every one of them
    .addSubcommand((s) => s.setName("setup").setDescription("Make the trap channel and turn the trap on (safe to run again)"))
    .addSubcommand((s) => s.setName("off").setDescription("Turn the trap off (the channel stays until you delete it)"))
    .addSubcommand((s) => s.setName("status").setDescription("Is the trap on, and where")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const cached = await ctx.client.guildConfig.get(guild.id);
    if (cached.degraded) {
      await interaction.reply({ content: "The settings are still loading. Try again in a moment.", ephemeral: true });
      return;
    }
    const mod = cached.settings.moderation;
    const sub = interaction.options.getSubcommand();
    const saved = mod.honeypotChannelId ? await guild.channels.fetch(mod.honeypotChannelId).catch(() => null) : null;

    if (sub === "status") {
      await interaction.reply({
        content: !mod.honeypotChannelId
          ? "The trap is off. `/honeypot setup` turns it on."
          : saved
            ? `The trap is on in ${saved}. Whoever writes there is removed with their last day of messages and may join again; staff only lose the message.`
            : "The trap is set to a channel that no longer exists, so it does nothing. Run `/honeypot setup` again.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "off") {
      await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...mod, honeypotChannelId: null } });
      await interaction.reply({ content: "The trap is off. The channel is still there: delete it if you don't want it.", ephemeral: true });
      return;
    }

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers) || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "I need the Ban Members and Manage Channels permissions for the trap: removing an account with its messages is a ban that I lift at once.",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    // run again: the same channel, never a second one
    const channel =
      saved?.type === ChannelType.GuildText
        ? saved
        : await guild.channels.create({ name: TRAP_CHANNEL_NAME, type: ChannelType.GuildText, topic: TRAP_TOPIC, position: 0, reason: "Trap channel for spam bots" });
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (!pins?.some((message) => message.author.id === me.id)) {
      const notice = await channel.send({ content: TRAP_NOTICE, allowedMentions: { parse: [] } }).catch(() => null);
      await notice?.pin().catch(() => undefined);
    }
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...mod, honeypotChannelId: channel.id } });
    await interaction.editReply({
      content: `The trap is on in ${channel}. Whoever writes there is removed with their last day of messages and may join again; staff and protected roles only lose the message. Keep the channel visible to everyone and near the top: spam bots post where they can. \`/honeypot off\` turns it off.`,
    });
  },
};
