// /modmail: where conversations live, who gets pinged, and the staff-side verbs (open, close, block).
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { modmailBlocks } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { closeModmail, openModmail, openThreadFor } from "../lib/modmail.js";

const THREAD_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.ManageThreads,
];

export const modmailCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Members DM ZARU, staff answer in threads")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Switch modmail on: a staff-only channel where each conversation becomes a thread")
        .addChannelOption((o) => o.setName("channel").setDescription("Staff-only text channel").addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption((o) => o.setName("ping").setDescription("Role to ping when a conversation opens")),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Switch modmail off"))
    .addSubcommand((s) =>
      s
        .setName("close")
        .setDescription("Close this conversation (run inside its thread)")
        .addStringOption((o) => o.setName("reason").setDescription("Told to the member").setMaxLength(500)),
    )
    .addSubcommand((s) =>
      s
        .setName("open")
        .setDescription("Start a conversation with a member")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("First message to them").setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s
        .setName("block")
        .setDescription("Stop a member from opening conversations")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("unblock")
        .setDescription("Let a blocked member use modmail again")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const cached = await client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    const sub = interaction.options.getSubcommand();

    if (sub === "set" || sub === "off") {
      const member = guild.members.cache.get(interaction.user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== guild.ownerId) {
        await interaction.reply({ content: "Switching modmail on or off needs Manage Server.", ephemeral: true });
        return;
      }
      if (sub === "off") {
        await persistGuildSettings(client, guild.id, { ...cached.settings, features: { ...features, modmailChannelId: null } });
        await interaction.reply({ content: "Modmail is off. Open threads stay where they are.", ephemeral: true });
        return;
      }
      const channel = interaction.options.getChannel("channel", true);
      const role = interaction.options.getRole("ping");
      const real = guild.channels.cache.get(channel.id);
      const me = guild.members.me;
      if (!real || !me || real.isThread() || !real.permissionsFor(me).has(THREAD_PERMS)) {
        await interaction.reply({
          content: `In <#${channel.id}> I need View Channel, Send Messages, Create Public Threads, Send Messages in Threads and Manage Threads.`,
          ephemeral: true,
        });
        return;
      }
      const everyone = real.permissionsFor(guild.roles.everyone).has(PermissionFlagsBits.ViewChannel);
      await persistGuildSettings(client, guild.id, {
        ...cached.settings,
        features: { ...features, modmailChannelId: channel.id, modmailPingRoleId: role?.id ?? null },
      });
      await interaction.reply({
        content:
          `Modmail is on. When a member DMs me, a thread opens in <#${channel.id}>${role ? ` and <@&${role.id}> is pinged` : ""}; replies in the thread reach them by DM, lines starting with \`//\` stay private.` +
          (everyone ? `\n⚠️ <#${channel.id}> is visible to @everyone; make it staff-only so members can't read each other's conversations.` : ""),
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === "close") {
      const row = client.modmailThreads.get(interaction.channelId);
      if (!row || row.guildId !== guild.id) {
        await interaction.reply({ content: "Run this inside a modmail thread.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: "Closing…", ephemeral: true });
      await closeModmail(client, row, interaction.user.tag, interaction.options.getString("reason") ?? "");
      return;
    }

    const user = interaction.options.getUser("user", true);
    if (sub === "block" || sub === "unblock") {
      if (sub === "block") {
        await client.db.insert(modmailBlocks).values({ guildId: guild.id, userId: user.id, blockedBy: interaction.user.id }).onConflictDoNothing();
        const open = openThreadFor(client, guild.id, user.id);
        if (open) await closeModmail(client, open, interaction.user.tag, "blocked from modmail");
        await interaction.reply({ content: `${user.username} can no longer open modmail conversations here.`, ephemeral: true });
      } else {
        await client.db.delete(modmailBlocks).where(and(eq(modmailBlocks.guildId, guild.id), eq(modmailBlocks.userId, user.id)));
        await interaction.reply({ content: `${user.username} can use modmail again.`, ephemeral: true });
      }
      return;
    }

    // open
    if (!features.modmailChannelId) {
      await interaction.reply({ content: "Modmail isn't set up: /modmail set first.", ephemeral: true });
      return;
    }
    if (user.bot) {
      await interaction.reply({ content: "Bots don't read DMs.", ephemeral: true });
      return;
    }
    const existing = openThreadFor(client, guild.id, user.id);
    if (existing) {
      const threadId = [...client.modmailThreads.entries()].find(([, r]) => r.id === existing.id)?.[0];
      await interaction.reply({ content: `There's already an open conversation with ${user.username}${threadId ? `: <#${threadId}>` : ""}.`, ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const opened = await openModmail(client, guild, user, `by ${interaction.user.tag}`);
    if (!opened) {
      await interaction.editReply("I couldn't open a thread (check the modmail channel and my permissions).");
      return;
    }
    const first = interaction.options.getString("message")?.trim();
    const delivered = await user
      .send({
        content: `**${guild.name}** staff opened a conversation with you${first ? `:\n> ${first}` : "."}\nReply here and they'll see it.`,
        allowedMentions: { parse: [] },
      })
      .then(() => true, () => false);
    if (first) await opened.thread.send({ content: `**${interaction.user.tag}:** ${first}`, allowedMentions: { parse: [] } }).catch(() => undefined);
    await interaction.editReply(`Opened <#${opened.thread.id}>.${delivered ? "" : " Their DMs are closed, so they haven't been told yet; they'll see replies once they DM me."}`);
  },
};
