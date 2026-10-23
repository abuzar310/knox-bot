// /ticket: the panel, topics, and what staff do inside a ticket (add or remove people, rename, save a transcript,
// close). Opening happens from the panel (lib/ticket-open.ts).
import { AttachmentBuilder, ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Guild, type GuildTextBasedChannel } from "discord.js";
import { and, eq } from "drizzle-orm";
import { tickets } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { buildTranscript, closeTicket } from "../lib/ticket-close.js";
import { panelComponents } from "../lib/ticket-open.js";

export { TICKET_CLAIM_ID, TICKET_CLOSE_ID, TICKET_OPEN_ID } from "../lib/ticket-open.js";

const MAX_TOPICS = 10;

async function ticketHere(client: KnoxClient, guild: Guild, channelId: string) {
  const [row] = await client.db
    .select()
    .from(tickets)
    .where(and(eq(tickets.guildId, guild.id), eq(tickets.channelId, channelId), eq(tickets.open, true)))
    .limit(1);
  return row ?? null;
}

function isAdmin(interaction: Parameters<KnoxCommand["execute"]>[0]) {
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  return Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild)) || interaction.user.id === interaction.guild?.ownerId;
}

export const ticketCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support tickets: panel, topics, and tools for the ticket you are in")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("panel")
        .setDescription("Post the ticket panel here (a topic menu when topics exist, else one button)")
        .addChannelOption((o) => o.setName("category").setDescription("Category for new tickets").addChannelTypes(ChannelType.GuildCategory).setRequired(true)),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("topics")
        .setDescription("Ticket topics shown in the panel menu")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Add a topic")
            .addStringOption((o) => o.setName("name").setDescription("e.g. Support, Report a member, Partnership").setRequired(true).setMaxLength(40))
            .addStringOption((o) => o.setName("emoji").setDescription("An emoji for the menu").setMaxLength(40))
            .addStringOption((o) => o.setName("description").setDescription("One line shown under the name").setMaxLength(100)),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove a topic")
            .addStringOption((o) => o.setName("name").setDescription("Topic name").setRequired(true).setMaxLength(40)),
        )
        .addSubcommand((s) => s.setName("list").setDescription("Current topics")),
    )
    .addSubcommand((s) =>
      s
        .setName("close")
        .setDescription("Close this ticket")
        .addStringOption((o) => o.setName("reason").setDescription("Noted in the transcript and told to the opener").setMaxLength(300)),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Let another member see this ticket")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a member from this ticket")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("rename")
        .setDescription("Rename this ticket channel")
        .addStringOption((o) => o.setName("name").setDescription("New name").setRequired(true).setMaxLength(90)),
    )
    .addSubcommand((s) => s.setName("transcript").setDescription("Save a transcript of this ticket so far (without closing)")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild || !ctx.settings) return;
    const client = ctx.client;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const features = ctx.settings.features;

    if (group === "topics") {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "Changing topics needs Manage Server.", ephemeral: true });
        return;
      }
      const topics = features.ticketTopics;
      if (sub === "list") {
        await interaction.reply({
          content: topics.length
            ? `Topics: ${topics.map((t) => `${t.emoji ? `${t.emoji} ` : ""}**${t.name}**${t.description ? ` (${t.description})` : ""}`).join(" · ")}\nRe-post the panel after changing topics.`
            : "No topics: the panel shows a single Open ticket button.",
          ephemeral: true,
        });
        return;
      }
      const name = interaction.options.getString("name", true).trim();
      if (sub === "remove") {
        const next = topics.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
        if (next.length === topics.length) {
          await interaction.reply({ content: `No topic called **${name}**.`, ephemeral: true });
          return;
        }
        await persistGuildSettings(client, guild.id, { ...ctx.settings, features: { ...features, ticketTopics: next } });
        await interaction.reply({ content: `Topic **${name}** removed. Re-post the panel with /ticket panel.`, ephemeral: true });
        return;
      }
      if (topics.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        await interaction.reply({ content: `**${name}** already exists.`, ephemeral: true });
        return;
      }
      if (topics.length >= MAX_TOPICS) {
        await interaction.reply({ content: `Up to ${MAX_TOPICS} topics; remove one first.`, ephemeral: true });
        return;
      }
      const emoji = interaction.options.getString("emoji")?.trim() || null;
      const description = interaction.options.getString("description")?.trim() || null;
      await persistGuildSettings(client, guild.id, { ...ctx.settings, features: { ...features, ticketTopics: [...topics, { name, emoji, description }] } });
      await interaction.reply({ content: `Topic **${name}** added (${topics.length + 1}/${MAX_TOPICS}). Re-post the panel with /ticket panel so the menu shows it.`, ephemeral: true });
      return;
    }

    if (sub === "panel") {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "Posting the panel needs Manage Server.", ephemeral: true });
        return;
      }
      const category = interaction.options.getChannel("category", true);
      await persistGuildSettings(client, guild.id, { ...ctx.settings, features: { ...features, ticketCategoryId: category.id } });
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings.embedColor)
            .setTitle("Need help?")
            .setDescription(features.ticketTopics.length ? "Pick what your ticket is about and tell us a little; a private channel with staff opens for you." : "Press the button and tell us a little; a private channel with staff opens for you."),
        ],
        components: panelComponents(features.ticketTopics),
      });
      return;
    }

    const row = await ticketHere(client, guild, interaction.channelId);
    if (!row) {
      await interaction.reply({ content: "This isn't an open ticket.", ephemeral: true });
      return;
    }
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased() || channel.isThread()) return;

    if (sub === "close") {
      await closeTicket(client, interaction, row, interaction.options.getString("reason") ?? "");
      return;
    }
    if (sub === "add" || sub === "remove") {
      const user = interaction.options.getUser("user", true);
      if (sub === "add") {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }, { reason: `Added to ticket by ${interaction.user.tag}` });
        await interaction.reply({ content: `${user} was added to this ticket.`, allowedMentions: { users: [user.id] } });
      } else {
        if (user.id === row.openerId) {
          await interaction.reply({ content: "The person who opened the ticket can't be removed; close it instead.", ephemeral: true });
          return;
        }
        await channel.permissionOverwrites.delete(user.id, `Removed from ticket by ${interaction.user.tag}`).catch(() => undefined);
        await interaction.reply({ content: `${user.username} was removed from this ticket.`, ephemeral: true });
      }
      return;
    }
    if (sub === "rename") {
      const name = interaction.options.getString("name", true).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
      if (!name) {
        await interaction.reply({ content: "Use letters, numbers and dashes.", ephemeral: true });
        return;
      }
      await channel.setName(name, `Renamed by ${interaction.user.tag}`);
      await interaction.reply({ content: `Renamed to **${name}**.`, ephemeral: true });
      return;
    }
    // transcript
    await interaction.deferReply({ ephemeral: true });
    const transcript = await buildTranscript(channel as GuildTextBasedChannel);
    await interaction.editReply({
      content: `Transcript so far: ${transcript.count} messages.`,
      files: [new AttachmentBuilder(Buffer.from(transcript.text, "utf8"), { name: `${channel.name}-${new Date().toISOString().slice(0, 10)}.txt` })],
    });
  },
};
