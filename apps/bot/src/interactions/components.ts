import { PermissionFlagsBits, type ButtonInteraction } from "discord.js";
import { and, eq, sql } from "drizzle-orm";
import { giveaways, reactionPanels, tickets } from "@knox/db";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { TICKET_CLAIM_ID, TICKET_CLOSE_ID, TICKET_OPEN_ID } from "../modules/community/commands/ticket.js";
import { GIVEAWAY_JOIN_ID } from "../modules/community/commands/giveaway.js";
import { VERIFY_ID } from "../modules/community/commands/tools.js";
import { closeTicket } from "../modules/community/lib/ticket-close.js";
import { openTicketModal } from "../modules/community/lib/ticket-open.js";
import { SETUP_AUTO_ID, TIDY_ID, thinkAbout } from "../modules/community/lib/server-report.js";
import { autoSetup } from "../modules/community/lib/auto-setup.js";
import { applyTidy } from "../lib/server-tidy.js";
import { AGENT_PREFIX, handleAssistantButton } from "./assistant-buttons.js";
import { VC_PREFIX, handleVoiceButton } from "../lib/temp-voice.js";
import { BJ_PREFIX, handleBlackjackButton } from "../modules/levels/lib/blackjack.js";
import { HLO_PREFIX, handleHigherLowerButton } from "../modules/levels/lib/higher-lower.js";
import { knoxEmbed } from "./embed.js";
import { resolveKnoxRank } from "../permissions/resolve.js";
import { canGrantRole } from "../lib/roles.js";
import { RANK_OPEN_ID, RANK_SAVE_ID, RANK_SKIP_ID, handleRankSetupButton } from "../lib/rank-setup.js";

export async function handleKnoxButton(interaction: ButtonInteraction, client: KnoxClient) {
  const id = interaction.customId;
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }

  if (id === RANK_SAVE_ID || id === RANK_SKIP_ID || id === RANK_OPEN_ID) {
    await handleRankSetupButton(interaction, client);
    return;
  }

  // blackjack and higher-lower belong to the levels module, so they sit above the community gate
  if (id.startsWith(BJ_PREFIX)) {
    await handleBlackjackButton(interaction, client);
    return;
  }
  if (id.startsWith(HLO_PREFIX)) {
    await handleHigherLowerButton(interaction, client);
    return;
  }

  // every button below belongs to the community module: a server that switched it off gets nothing
  const cached = await client.guildConfig.get(interaction.guild.id);
  if (!cached.settings.moduleFlags.community) {
    await interaction.reply({ content: "The community module is off in this server.", ephemeral: true });
    return;
  }

  if (id.startsWith(AGENT_PREFIX)) {
    await handleAssistantButton(interaction, client);
    return;
  }

  if (id.startsWith(VC_PREFIX)) {
    await handleVoiceButton(interaction, client);
    return;
  }

  if (id === TIDY_ID) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: "Someone with **Manage Server** has to press this.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const brain = await thinkAbout(client, interaction.guild);
    const result = await applyTidy(interaction.guild, brain.analysis.tidy, interaction.user.tag);
    client.serverBrain.delete(interaction.guild.id);
    const embed = knoxEmbed(cached.settings.embedColor).setTitle("Tidy-up done").setDescription(result.done.join("\n").slice(0, 4000) || "Nothing needed doing.");
    if (result.skipped.length) embed.addFields({ name: "Skipped", value: result.skipped.join("\n").slice(0, 1024) });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (id === SETUP_AUTO_ID) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: "Someone with **Manage Server** has to press this.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const work = await autoSetup(client, interaction.guild, interaction.user);
    const embed = knoxEmbed(cached.settings.embedColor).setTitle("ZARU is set up").setDescription(work.lines.join("\n").slice(0, 4000) || "Nothing to do.");
    if (work.warnings.length) embed.addFields({ name: "Still needs a human", value: work.warnings.join("\n").slice(0, 1024) });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (id === TICKET_OPEN_ID) {
    // the ticket itself is created when the reason pop-up comes back (community/lib/ticket-open.ts)
    await openTicketModal(interaction, client, -1);
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
    // account-age gate (anti-alt): read straight off the user, no member fetch needed
    if (row.minAccountDays > 0) {
      const ageDays = (Date.now() - interaction.user.createdTimestamp) / 86_400_000;
      if (ageDays < row.minAccountDays) {
        await interaction.reply({
          content: `Your account must be at least ${row.minAccountDays} day${row.minAccountDays === 1 ? "" : "s"} old to enter.`,
          ephemeral: true,
        });
        return;
      }
    }
    // a required role gates entry; a bonus role multiplies a member's odds — both need the member's roles
    let weight = 1;
    if (row.requiredRoleId || (row.bonusRoleId && row.bonusEntries > 0)) {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (row.requiredRoleId && !member?.roles.cache.has(row.requiredRoleId)) {
        await interaction.reply({
          content: `You need the <@&${row.requiredRoleId}> role to enter.`,
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      if (row.bonusRoleId && row.bonusEntries > 0 && member?.roles.cache.has(row.bonusRoleId)) {
        weight = 1 + row.bonusEntries;
      }
    }
    // appended inside the database, so two people tapping at once can't overwrite each other's entry.
    // a bonus-role member is appended `weight` times to raise their odds; the once-guard still blocks a second join.
    const entry = JSON.stringify(Array.from({ length: weight }, () => interaction.user.id));
    const once = JSON.stringify([interaction.user.id]);
    const joined = await client.db
      .update(giveaways)
      .set({ entries: sql`${giveaways.entries} || ${entry}::jsonb` })
      .where(
        and(
          eq(giveaways.id, row.id),
          eq(giveaways.ended, false),
          sql`not (${giveaways.entries} @> ${once}::jsonb)`,
        ),
      )
      .returning({ id: giveaways.id });
    await interaction.reply({
      content: joined.length ? (weight > 1 ? `You're in with **${weight} entries**.` : "You're in.") : "You're already in.",
      ephemeral: true,
    });
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
