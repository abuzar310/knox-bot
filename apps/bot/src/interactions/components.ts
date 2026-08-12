import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { giveaways, reactionPanels, tickets } from "@knox/db";
import type { KnoxClient } from "../client.js";
import { TICKET_CLAIM_ID, TICKET_CLOSE_ID, TICKET_OPEN_ID } from "../modules/community/commands/ticket.js";
import { GIVEAWAY_JOIN_ID } from "../modules/community/commands/giveaway.js";
import { VERIFY_ID } from "../modules/community/commands/tools.js";

export async function handleKnoxButton(interaction: ButtonInteraction, client: KnoxClient) {
  const id = interaction.customId;
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  if (id === TICKET_OPEN_ID) {
    const cached = await client.guildConfig.get(interaction.guild.id);
    const categoryId = cached.settings.features.ticketCategoryId;
    if (!categoryId) {
      await interaction.reply({ content: "Tickets are not set up. An admin must run `/ticket panel`.", ephemeral: true });
      return;
    }
    const existing = await client.db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.guildId, interaction.guild.id),
          eq(tickets.openerId, interaction.user.id),
          eq(tickets.open, true),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await interaction.reply({ content: `You already have <#${existing[0].channelId}>.`, ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        {
          id: interaction.client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
        },
      ],
    });
    await client.db.insert(tickets).values({
      guildId: interaction.guild.id,
      channelId: channel.id,
      openerId: interaction.user.id,
    });
    await channel.send({
      content: `${interaction.user} opened a ticket.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(TICKET_CLAIM_ID).setLabel("Claim").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel("Close").setStyle(ButtonStyle.Danger),
        ),
      ],
    });
    await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
    return;
  }

  if (id === TICKET_CLOSE_ID || id === TICKET_CLAIM_ID) {
    const [row] = await client.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.guildId, interaction.guild.id), eq(tickets.channelId, interaction.channelId)))
      .limit(1);
    if (!row) {
      await interaction.reply({ content: "Not a ticket.", ephemeral: true });
      return;
    }
    if (id === TICKET_CLAIM_ID) {
      await client.db.update(tickets).set({ claimedBy: interaction.user.id }).where(eq(tickets.id, row.id));
      await interaction.reply({ content: `${interaction.user} claimed this ticket.` });
      return;
    }
    await client.db.update(tickets).set({ open: false }).where(eq(tickets.id, row.id));
    await interaction.reply({ content: "Closing in 5s." });
    setTimeout(() => interaction.channel?.delete("Ticket closed").catch(() => undefined), 5000);
    return;
  }

  if (id === GIVEAWAY_JOIN_ID) {
    const [row] = await client.db
      .select()
      .from(giveaways)
      .where(
        and(
          eq(giveaways.guildId, interaction.guild.id),
          eq(giveaways.messageId, interaction.message.id),
          eq(giveaways.ended, false),
        ),
      )
      .limit(1);
    if (!row) {
      await interaction.reply({ content: "Giveaway is over.", ephemeral: true });
      return;
    }
    if (row.entries.includes(interaction.user.id)) {
      await interaction.reply({ content: "You're already in.", ephemeral: true });
      return;
    }
    await client.db
      .update(giveaways)
      .set({ entries: [...row.entries, interaction.user.id] })
      .where(eq(giveaways.id, row.id));
    await interaction.reply({ content: "You're in.", ephemeral: true });
    return;
  }

  if (id === VERIFY_ID) {
    const cached = await client.guildConfig.get(interaction.guild.id);
    const roleId = cached.settings.features.verifyRoleId;
    if (!roleId) {
      await interaction.reply({ content: "Verification role is not set.", ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(roleId).catch(() => undefined);
    await interaction.reply({ content: "You're verified.", ephemeral: true });
    return;
  }

  if (id.startsWith("knox:rr:")) {
    const parts = id.split(":");
    const panelId = Number(parts[2]);
    const roleId = parts[3];
    if (!roleId || !Number.isFinite(panelId)) return;
    const [panel] = await client.db.select().from(reactionPanels).where(eq(reactionPanels.id, panelId)).limit(1);
    if (!panel) {
      await interaction.reply({ content: "Panel is gone.", ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch(() => undefined);
      await interaction.reply({ content: "Role removed.", ephemeral: true });
    } else {
      await member.roles.add(roleId).catch(() => undefined);
      await interaction.reply({ content: "Role added.", ephemeral: true });
    }
  }
}
