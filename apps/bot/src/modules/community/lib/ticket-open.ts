// Opening a ticket: the panel's button or topic menu asks for a short reason in a pop-up, then the private channel
// is created with that reason as its first message and the staff rank roles pinged.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { tickets } from "@knox/db";
import type { FeatureConfig } from "@knox/config";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const TICKET_OPEN_ID = "knox:ticket:open";
export const TICKET_CLOSE_ID = "knox:ticket:close";
export const TICKET_CLAIM_ID = "knox:ticket:claim";
export const TICKET_TOPIC_ID = "knox:ticket:topic";
const MODAL_PREFIX = "knox:ticket:modal:";

export type TicketTopic = FeatureConfig["ticketTopics"][number];

export function ticketModalId(topicIndex: number) {
  return `${MODAL_PREFIX}${topicIndex}`;
}

export function parseTicketModalId(customId: string): number | null {
  if (!customId.startsWith(MODAL_PREFIX)) return null;
  const n = Number(customId.slice(MODAL_PREFIX.length));
  return Number.isInteger(n) && n >= -1 ? n : null;
}

/** the panel's control: a topic menu when topics exist, a single button otherwise */
export function panelComponents(topics: TicketTopic[]) {
  if (topics.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(TICKET_TOPIC_ID)
      .setPlaceholder("What is your ticket about?")
      .addOptions(
        topics.slice(0, 25).map((t, i) => ({
          label: t.name.slice(0, 100),
          value: String(i),
          ...(t.description ? { description: t.description.slice(0, 100) } : {}),
          ...(t.emoji ? { emoji: t.emoji } : {}),
        })),
      );
    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
  }
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(TICKET_OPEN_ID).setLabel("Open ticket").setStyle(ButtonStyle.Primary).setEmoji("🎫"))];
}

export async function openTicketOf(client: KnoxClient, guildId: string, userId: string) {
  const [row] = await client.db
    .select()
    .from(tickets)
    .where(and(eq(tickets.guildId, guildId), eq(tickets.openerId, userId), eq(tickets.open, true)))
    .limit(1);
  return row ?? null;
}

/** asks what the ticket is about (topicIndex -1 = no topic) */
export async function openTicketModal(interaction: ButtonInteraction | StringSelectMenuInteraction, client: KnoxClient, topicIndex: number) {
  const guild = interaction.guild;
  if (!guild) return;
  const cached = await client.guildConfig.get(guild.id);
  if (!cached.settings.features.ticketCategoryId) {
    await interaction.reply({ content: "Tickets are not set up. An admin must run `/ticket panel`.", ephemeral: true });
    return;
  }
  const existing = await openTicketOf(client, guild.id, interaction.user.id);
  if (existing) {
    await interaction.reply({ content: `You already have <#${existing.channelId}>.`, ephemeral: true });
    return;
  }
  const topic = topicIndex >= 0 ? cached.settings.features.ticketTopics[topicIndex] : undefined;
  const modal = new ModalBuilder()
    .setCustomId(ticketModalId(topic ? topicIndex : -1))
    .setTitle((topic ? `${topic.name} ticket` : "Open a ticket").slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("What do you need help with?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(500),
      ),
    );
  await interaction.showModal(modal);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "ticket";
}

/** the reason modal came back: create the channel, the first message and the database row */
export async function createTicketFromModal(interaction: ModalSubmitInteraction, client: KnoxClient, topicIndex: number) {
  const guild = interaction.guild;
  if (!guild) return;
  const cached = await client.guildConfig.get(guild.id);
  const categoryId = cached.settings.features.ticketCategoryId;
  if (!categoryId) {
    await interaction.reply({ content: "Tickets are not set up any more.", ephemeral: true });
    return;
  }
  const existing = await openTicketOf(client, guild.id, interaction.user.id);
  if (existing) {
    await interaction.reply({ content: `You already have <#${existing.channelId}>.`, ephemeral: true });
    return;
  }
  const topic = topicIndex >= 0 ? cached.settings.features.ticketTopics[topicIndex] : undefined;
  let reason = "";
  try {
    reason = interaction.fields.getTextInputValue("reason").trim().slice(0, 500);
  } catch {
    reason = "";
  }
  await interaction.deferReply({ ephemeral: true });

  // the opener, the bot, and the server's mod/admin rank roles can see the ticket
  const staffRoleIds = [...new Set(cached.permissionRows.filter((r) => r.rank === "admin" || r.rank === "mod").map((r) => r.roleId))].filter((id) => guild.roles.cache.has(id));
  const channel = await guild.channels.create({
    name: `${topic ? slug(topic.name) : "ticket"}-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: `Ticket · ${interaction.user.tag} (${interaction.user.id})${topic ? ` · ${topic.name}` : ""}`.slice(0, 1024),
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: client.user!.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
      },
      ...staffRoleIds.map((roleId) => ({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      })),
    ],
  });
  const [row] = await client.db
    .insert(tickets)
    .values({ guildId: guild.id, channelId: channel.id, openerId: interaction.user.id, topic: topic?.name ?? null, reason: reason || null })
    .returning();
  const embed = knoxEmbed(cached.settings.embedColor)
    .setTitle(`${topic?.emoji ? `${topic.emoji} ` : ""}${topic?.name ?? "Ticket"} #${row?.id ?? ""}`.trim())
    .setDescription(reason || "*(no details given)*")
    .setFooter({ text: `Opened by ${interaction.user.tag}` })
    .setTimestamp();
  await channel.send({
    content: `${interaction.user} opened a ticket.${staffRoleIds.length ? ` ${staffRoleIds.map((id) => `<@&${id}>`).join(" ")}` : ""}`,
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(TICKET_CLAIM_ID).setLabel("Claim").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel("Close").setStyle(ButtonStyle.Danger),
      ),
    ],
    allowedMentions: { users: [interaction.user.id], roles: staffRoleIds },
  });
  await interaction.editReply(`Ticket created: ${channel}`);
}
