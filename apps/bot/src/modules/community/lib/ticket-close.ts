// Closing a ticket: mark it closed, save a transcript of the conversation to the log channel and to the person
// who opened it, then delete the channel.
import { AttachmentBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type GuildTextBasedChannel } from "discord.js";
import { eq } from "drizzle-orm";
import { tickets } from "@knox/db";
import type { KnoxClient } from "../../../client.js";

type TicketRow = typeof tickets.$inferSelect;

/** the last few hundred messages of a channel as plain text, oldest first */
export async function buildTranscript(channel: GuildTextBasedChannel) {
  const all: { at: number; line: string }[] = [];
  let before: string | undefined;
  for (let page = 0; page < 3; page++) {
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

export async function closeTicket(
  client: KnoxClient,
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  row: TicketRow,
  reason = "",
) {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild) return;
  await client.db.update(tickets).set({ open: false }).where(eq(tickets.id, row.id));

  const name = channel && "name" in channel && channel.name ? channel.name : "ticket";
  const transcript = channel && channel.isTextBased() && !channel.isDMBased() ? await buildTranscript(channel as GuildTextBasedChannel) : null;
  const fileName = `${name}-${new Date().toISOString().slice(0, 10)}.txt`;
  const why = reason.trim() ? ` · reason: ${reason.trim().slice(0, 300)}` : "";
  const summary = `Ticket **${name}**${row.topic ? ` (${row.topic})` : ""} closed by ${interaction.user.tag} · opened by <@${row.openerId}>${row.claimedBy ? ` · claimed by <@${row.claimedBy}>` : ""} · ${transcript?.count ?? 0} messages${why}`;

  const cached = await client.guildConfig.get(guild.id);
  if (cached.settings.logChannelId && transcript) {
    const log = await guild.channels.fetch(cached.settings.logChannelId).catch(() => null);
    if (log && log.isTextBased() && !log.isDMBased()) {
      await log
        .send({ content: summary, files: [new AttachmentBuilder(Buffer.from(transcript.text, "utf8"), { name: fileName })], allowedMentions: { parse: [] } })
        .catch(() => undefined);
    }
  }
  if (transcript) {
    const opener = await client.users.fetch(row.openerId).catch(() => null);
    await opener
      ?.send({ content: `Your ticket in **${guild.name}** was closed${reason.trim() ? `: ${reason.trim().slice(0, 300)}` : "."} The transcript is attached.`, files: [new AttachmentBuilder(Buffer.from(transcript.text, "utf8"), { name: fileName })], allowedMentions: { parse: [] } })
      .catch(() => undefined);
  }

  await interaction.reply({ content: "Ticket closed. The transcript went to the log channel and to whoever opened it. Channel deleting in 5s." });
  setTimeout(() => channel?.delete("ZARU ticket closed").catch(() => undefined), 5000);
}
