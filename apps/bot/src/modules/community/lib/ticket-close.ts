// Closing a ticket: transcript, log channel, optional soft-close (lock channel) vs hard delete.
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import { tickets } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { TICKET_REOPEN_ID } from "./ticket-open.js";

type TicketRow = typeof tickets.$inferSelect;

/** the last few hundred messages of a channel as plain text, oldest first */
export async function buildTranscript(channel: GuildTextBasedChannel) {
  const all: { at: number; line: string }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const m of batch.values()) {
      const when = new Date(m.createdTimestamp).toISOString().replace("T", " ").slice(0, 16);
      const files = m.attachments.size ? ` [files: ${[...m.attachments.values()].map((a) => a.url).join(" ")}]` : "";
      const embeds = m.embeds.length && !m.content ? ` [embed: ${m.embeds[0]?.title ?? m.embeds[0]?.description?.slice(0, 80) ?? "…"}]` : "";
      all.push({ at: m.createdTimestamp, line: `[${when}] ${m.author.tag}: ${m.content}${files}${embeds}` });
    }
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  all.sort((a, b) => a.at - b.at);
  return { text: all.map((x) => x.line).join("\n") || "(no messages)", count: all.length };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildTranscriptHtml(title: string, lines: string) {
  const body = escapeHtml(lines)
    .split("\n")
    .map((line) => `<div class="line">${line || "&nbsp;"}</div>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0f0c;color:#f3f6ef;padding:1rem;max-width:900px;margin:auto}
.line{padding:.35rem .5rem;border-bottom:1px solid #243028;font-size:14px;white-space:pre-wrap;word-break:break-word}</style></head>
<body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

function logChannelId(cached: Awaited<ReturnType<KnoxClient["guildConfig"]["get"]>>) {
  return cached.settings.features.ticketLogChannelId ?? cached.settings.logChannelId;
}

async function sendTranscriptBundle(
  guild: NonNullable<ChatInputCommandInteraction["guild"]>,
  client: KnoxClient,
  cached: Awaited<ReturnType<KnoxClient["guildConfig"]["get"]>>,
  row: TicketRow,
  name: string,
  transcript: { text: string; count: number },
  summary: string,
  interactionUserTag: string,
) {
  const fileName = `${name}-${new Date().toISOString().slice(0, 10)}.txt`;
  const htmlName = `${name}-${new Date().toISOString().slice(0, 10)}.html`;
  const txt = new AttachmentBuilder(Buffer.from(transcript.text, "utf8"), { name: fileName });
  const html = new AttachmentBuilder(Buffer.from(buildTranscriptHtml(name, transcript.text), "utf8"), { name: htmlName });

  const logId = logChannelId(cached);
  if (logId) {
    const log = await guild.channels.fetch(logId).catch(() => null);
    if (log && log.isTextBased() && !log.isDMBased()) {
      await log
        .send({ content: summary, files: [html, txt], allowedMentions: { parse: [] } })
        .catch(() => undefined);
    }
  }

  const opener = await client.users.fetch(row.openerId).catch(() => null);
  await opener
    ?.send({
      content: `Your ticket in **${guild.name}** was closed by ${interactionUserTag}.${transcript.count ? " Transcript attached." : ""}`,
      files: [html],
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
}

export async function reopenTicket(
  client: KnoxClient,
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  row: TicketRow,
) {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel || !channel.isTextBased() || channel.isDMBased()) return;
  await client.db.update(tickets).set({ open: true, claimedBy: null }).where(eq(tickets.id, row.id));
  const cached = await client.guildConfig.get(guild.id);
  const staffRoleIds = [...new Set(cached.permissionRows.filter((r) => r.rank === "admin" || r.rank === "mod").map((r) => r.roleId))].filter((id) => guild.roles.cache.has(id));
  if (channel.isTextBased() && !channel.isDMBased() && !channel.isThread() && "permissionOverwrites" in channel) {
    await channel.permissionOverwrites
      .edit(row.openerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      })
      .catch(() => undefined);
  }
  const base = row.topic ? row.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20) : "ticket";
  const opener = await client.users.fetch(row.openerId).catch(() => null);
  const uname = opener?.username ?? "member";
  await channel.setName(`${base}-${uname}`.slice(0, 90).replace(/^closed-/, ""), "Ticket reopened");
  await interaction.reply({
    content: `Ticket reopened for ${opener ? `<@${row.openerId}>` : "the opener"}.${staffRoleIds.length ? ` ${staffRoleIds.map((id) => `<@&${id}>`).join(" ")}` : ""}`,
    allowedMentions: { users: [row.openerId], roles: staffRoleIds },
  });
}

export async function closeTicket(
  client: KnoxClient,
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  row: TicketRow,
  reason = "",
) {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild) return;
  const cached = await client.guildConfig.get(guild.id);
  const soft = cached.settings.features.ticketSoftClose ?? false;
  await client.db.update(tickets).set({ open: false }).where(eq(tickets.id, row.id));

  const name = channel && "name" in channel && channel.name ? channel.name : "ticket";
  const transcript =
    channel && channel.isTextBased() && !channel.isDMBased() ? await buildTranscript(channel as GuildTextBasedChannel) : null;
  const why = reason.trim() ? ` · reason: ${reason.trim().slice(0, 300)}` : "";
  const summary = `Ticket **${name}**${row.topic ? ` (${row.topic})` : ""} closed by ${interaction.user.tag} · opened by <@${row.openerId}>${row.claimedBy ? ` · claimed by <@${row.claimedBy}>` : ""} · ${transcript?.count ?? 0} messages${why}`;

  if (transcript) {
    await sendTranscriptBundle(guild, client, cached, row, name, transcript, summary, interaction.user.tag);
  }

  if (soft && channel && channel.isTextBased() && !channel.isDMBased() && !channel.isThread() && "permissionOverwrites" in channel) {
    await channel.permissionOverwrites.edit(row.openerId, { SendMessages: false }).catch(() => undefined);
    const closedName = channel.name.startsWith("closed-") ? channel.name : `closed-${channel.name}`.slice(0, 90);
    await channel.setName(closedName, "Ticket soft-closed");
    const embed = knoxEmbed(cached.settings.embedColor)
      .setTitle("Ticket closed")
      .setDescription(`${summary}\n\nChannel locked. Staff can **Reopen** or delete manually.`)
      .setTimestamp();
    await channel.send({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(TICKET_REOPEN_ID).setLabel("Reopen").setStyle(ButtonStyle.Success),
        ),
      ],
    });
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: "Ticket closed and locked. Transcript saved." });
      else await interaction.reply({ content: "Ticket closed and locked. Transcript saved.", ephemeral: true });
    }
    return;
  }

  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "Ticket closed. Transcript saved. Channel deleting in 5s." });
    } else {
      await interaction.reply({ content: "Ticket closed. Transcript saved. Channel deleting in 5s." });
    }
  }
  setTimeout(() => channel?.delete("ZARU ticket closed").catch(() => undefined), 5000);
}
