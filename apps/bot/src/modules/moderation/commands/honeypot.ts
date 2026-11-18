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
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Make the trap channel, or turn an existing channel into it")
        .addChannelOption((o) => o.setName("channel").setDescription("Use this channel instead of making a new one").addChannelTypes(ChannelType.GuildText).setRequired(false)),
    )
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

    if (sub === "status") {
      const channel = mod.honeypotChannelId ? guild.channels.cache.get(mod.honeypotChannelId) : null;
      await interaction.reply({
        content: !mod.honeypotChannelId
          ? "The trap is off. `/honeypot setup` turns it on."
          : channel
            ? `The trap is on in ${channel}. Whoever writes there is removed with their last day of messages and may join again; staff only lose the message.`
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
    if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({ content: "I need the Ban Members permission for the trap: removing an account with its messages is a ban that I lift at once.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const picked = interaction.options.getChannel("channel");
    let channel = picked ? await guild.channels.fetch(picked.id).catch(() => null) : null;
    if (picked && channel?.type !== ChannelType.GuildText) {
      await interaction.editReply({ content: "Pick a normal text channel." });
      return;
    }
    if (!channel) {
      channel = await guild.channels.create({ name: TRAP_CHANNEL_NAME, type: ChannelType.GuildText, topic: TRAP_TOPIC, position: 0, reason: "Trap channel for spam bots" });
    }
    if (channel.type !== ChannelType.GuildText) return;
    const notice = await channel.send({ content: TRAP_NOTICE, allowedMentions: { parse: [] } }).catch(() => null);
    await notice?.pin().catch(() => undefined);
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...mod, honeypotChannelId: channel.id } });
    await interaction.editReply({
      content: `The trap is on in ${channel}. Whoever writes there is removed with their last day of messages and may join again; staff and protected roles only lose the message. Keep the channel visible to everyone and near the top: spam bots post where they can. \`/honeypot off\` turns it off.`,
    });
  },
};
