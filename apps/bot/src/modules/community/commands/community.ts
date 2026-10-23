// /community: the automations that each need a channel: weekly digest, event posts, anniversaries, bump reminders.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type SlashCommandSubcommandGroupBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

const TEXT_LIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

const channelGroup = (g: SlashCommandSubcommandGroupBuilder, what: string, extra?: (s: import("discord.js").SlashCommandSubcommandBuilder) => void) =>
  g
    .addSubcommand((s) => {
      s.setName("set").setDescription(`Post ${what} in a channel`).addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(...TEXT_LIKE).setRequired(true));
      extra?.(s);
      return s;
    })
    .addSubcommand((s) => s.setName("off").setDescription(`Stop ${what}`));

export const communityCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("community")
    .setDescription("Weekly digest, event posts, anniversaries and DISBOARD bump reminders")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((g) => channelGroup(g.setName("digest").setDescription("Weekly activity summary, Mondays 08:00 UTC"), "the weekly digest"))
    .addSubcommandGroup((g) =>
      channelGroup(g.setName("events").setDescription("Announce new Discord events and remind 30 minutes before"), "event posts", (s) =>
        s.addRoleOption((o) => o.setName("ping").setDescription("Role to ping with the 30-minute reminder")),
      ),
    )
    .addSubcommandGroup((g) => channelGroup(g.setName("anniversaries").setDescription("Celebrate members on the day they joined"), "anniversaries"))
    .addSubcommandGroup((g) =>
      g
        .setName("bump")
        .setDescription("Remind the server two hours after a DISBOARD bump")
        .addSubcommand((s) => s.setName("on").setDescription("Switch bump reminders on").addRoleOption((o) => o.setName("ping").setDescription("Role to ping when it's time")))
        .addSubcommand((s) => s.setName("off").setDescription("Switch bump reminders off"))
        .addSubcommand((s) => s.setName("status").setDescription("Current setting")),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand();
    const save = (patch: Partial<typeof features>) => persistGuildSettings(ctx.client, guild.id, { ...cached.settings, features: { ...features, ...patch } });

    if (group === "bump") {
      if (sub === "status") {
        await interaction.reply({
          content: features.bumpReminderEnabled
            ? `Bump reminders are on${features.bumpReminderRoleId ? `, pinging <@&${features.bumpReminderRoleId}>` : ""}. I watch for DISBOARD's "Bump done" and remind two hours later in the same channel.`
            : "Bump reminders are off.",
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      const enabled = sub === "on";
      const role = enabled ? interaction.options.getRole("ping") : null;
      await save({ bumpReminderEnabled: enabled, bumpReminderRoleId: enabled ? (role?.id ?? features.bumpReminderRoleId) : features.bumpReminderRoleId });
      await interaction.reply({
        content: enabled ? `Bump reminders are on${role ? `, pinging <@&${role.id}>` : ""}. After DISBOARD says "Bump done" I react ⏰ and remind two hours later in that channel.` : "Bump reminders are off.",
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const channelId = sub === "set" ? interaction.options.getChannel("channel", true).id : null;
    if (group === "digest") {
      await save({ digestChannelId: channelId });
      await interaction.reply({ content: channelId ? `Every Monday at 08:00 UTC the last week's activity is posted in <#${channelId}>. /stats shows it any time.` : "The weekly digest is off.", ephemeral: true });
      return;
    }
    if (group === "events") {
      const roleId = channelId ? (interaction.options.getRole("ping")?.id ?? null) : null;
      await save({ eventReminderChannelId: channelId, eventReminderRoleId: roleId });
      await interaction.reply({
        content: channelId ? `New events are announced in <#${channelId}> and everyone${roleId ? ` (<@&${roleId}>)` : ""} is reminded 30 minutes before each one starts.` : "Event posts are off.",
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }
    await save({ anniversaryChannelId: channelId });
    await interaction.reply({
      content: channelId ? `Every day at 08:00 UTC, members who joined **${guild.name}** on that date a year or more ago are celebrated in <#${channelId}>.` : "Anniversary posts are off.",
      ephemeral: true,
    });
  },
};
