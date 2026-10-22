import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";
import { and, eq, sql } from "drizzle-orm";
import { giveaways, reactionPanels, tickets } from "@knox/db";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { TICKET_CLAIM_ID, TICKET_CLOSE_ID, TICKET_OPEN_ID } from "../modules/community/commands/ticket.js";
import { GIVEAWAY_JOIN_ID } from "../modules/community/commands/giveaway.js";
import { VERIFY_ID } from "../modules/community/commands/tools.js";
import { closeTicket } from "../modules/community/lib/ticket-close.js";
import { resolveKnoxRank } from "../permissions/resolve.js";
import { canGrantRole } from "../lib/roles.js";

export async function handleKnoxButton(interaction: ButtonInteraction, client: KnoxClient) {
  const id = interaction.customId;
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }
  // every button here belongs to the community module: a server that switched it off gets nothing
  const cached = await client.guildConfig.get(interaction.guild.id);
  if (!cached.settings.moduleFlags.community) {
    await interaction.reply({ content: "The community module is off in this server.", ephemeral: true });
    return;
  }

  if (id === TICKET_OPEN_ID) {
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
    // the opener, the bot, and the server's mod/admin rank roles can see the ticket
    const staffRoleIds = [...new Set(cached.permissionRows.filter((r) => r.rank === "admin" || r.rank === "mod").map((r) => r.roleId))];
    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
        },
        {
          id: interaction.client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
        },
        ...staffRoleIds.map((roleId) => ({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
        })),
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
    if (!row.open) {
      await interaction.reply({ content: "This ticket is already closed.", ephemeral: true });
      return;
    }
    // staff = Manage Channels on Discord or ZARU mod rank; the opener may close their own ticket
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isStaff =
      member.permissions.has(PermissionFlagsBits.ManageChannels) || hasMinRank(resolveKnoxRank(member, cached.permissionRows), "mod");
    const isOpener = row.openerId === interaction.user.id;
    if (id === TICKET_CLAIM_ID) {
      if (!isStaff) {
        await interaction.reply({ content: "Only staff can claim a ticket.", ephemeral: true });
        return;
      }
      await client.db.update(tickets).set({ claimedBy: interaction.user.id }).where(eq(tickets.id, row.id));
      await interaction.reply({ content: `${interaction.user} claimed this ticket.` });
      return;
    }
    if (!isStaff && !isOpener) {
      await interaction.reply({ content: "Only staff or the person who opened this ticket can close it.", ephemeral: true });
      return;
    }
    await closeTicket(client, interaction, row);
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
    // appended inside the database, so two people tapping at once can't overwrite each other's entry
    const entry = JSON.stringify([interaction.user.id]);
    const joined = await client.db
      .update(giveaways)
      .set({ entries: sql`${giveaways.entries} || ${entry}::jsonb` })
      .where(
        and(
          eq(giveaways.id, row.id),
          eq(giveaways.ended, false),
          sql`not (${giveaways.entries} @> ${entry}::jsonb)`,
        ),
      )
      .returning({ id: giveaways.id });
    await interaction.reply({ content: joined.length ? "You're in." : "You're already in.", ephemeral: true });
    return;
  }

  if (id === VERIFY_ID) {
    const cached = await client.guildConfig.get(interaction.guild.id);
    const roleId = cached.settings.features.verifyRoleId;
    if (!roleId) {
      await interaction.reply({ content: "Verification role is not set.", ephemeral: true });
      return;
    }
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!canGrantRole(role)) {
      await interaction.reply({ content: "The verification role can't be given right now. Tell an admin.", ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const ok = await member.roles.add(role).then(() => true, () => false);
    await interaction.reply({ content: ok ? "You're verified." : "Couldn't give you the role. Tell an admin.", ephemeral: true });
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
    // only roles the panel actually lists, and only ones the bot may hand out
    if (!panel.mapping.some((m) => m.roleId === roleId)) {
      await interaction.reply({ content: "That button isn't on this panel any more.", ephemeral: true });
      return;
    }
    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!canGrantRole(role)) {
      await interaction.reply({ content: "That role can't be given right now. Tell an admin.", ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(roleId)) {
      const ok = await member.roles.remove(role).then(() => true, () => false);
      await interaction.reply({ content: ok ? "Role removed." : "Couldn't remove that role.", ephemeral: true });
    } else {
      const ok = await member.roles.add(role).then(() => true, () => false);
      await interaction.reply({ content: ok ? "Role added." : "Couldn't add that role.", ephemeral: true });
    }
  }
}
