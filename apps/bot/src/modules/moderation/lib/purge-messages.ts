import type { GuildTextBasedChannel, Message } from "discord.js";

/** a command, a short aside, or ZARU's own status is not the announcement to keep */
export function announcementScore(message: Message, invokerId: string, botId: string): number {
  const text = message.content.trim();
  if (/^[?!]/.test(text) || /^zaru\b/i.test(text)) return 0;
  const embedText = message.embeds.map((embed) => `${embed.title ?? ""} ${embed.description ?? ""}`).join("\n");
  const blob = `${text}\n${embedText}`;
  if (message.author.id === botId && /should i do it|working on it|done with|deleted \d+|thinking/i.test(blob)) return 0;
  if (message.author.id === invokerId && text.length < 240) return 0;
  const len = text.length + embedText.length;
  if (len < 40) return 0;
  return len + (message.embeds.length ? 400 : 0);
}

/** the posts worth keeping: long greetings and embeds, not the newest command line */
export function pickKeepIds(messages: Message[], keep: number, invokerId: string, botId: string): Set<string> {
  if (keep <= 0) return new Set();
  return new Set(
    messages
      .map((message) => ({ message, score: announcementScore(message, invokerId, botId) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || b.message.createdTimestamp - a.message.createdTimestamp)
      .slice(0, keep)
      .map((row) => row.message.id),
  );
}

/** "@everyone" plus a pile of images, which is how the casino-scam posts were sent */
export function isScamImagePing(input: { content: string; pinned?: boolean; mentionEveryone?: boolean; attachments: number }): boolean {
  if (input.pinned) return false;
  const text = input.content.trim();
  const ping = input.mentionEveryone || /@(everyone|here)\b/i.test(text);
  return ping && input.attachments >= 2 && text.length < 80;
}

export function isScamSweepAsk(text: string): boolean {
  return /\b(remove|delete|clear|hatao|hata do)\b/i.test(text) && /\b(scam|spam)\b/i.test(text);
}

const BULK_MAX_AGE_MS = 14 * 24 * 3_600_000;

/** Discord bulk-delete only works under 14 days; older messages are removed one by one. */
export async function deleteMessages(channel: GuildTextBasedChannel, messages: Iterable<Message>): Promise<number> {
  const list = [...messages].filter((m) => !m.pinned);
  if (!list.length) return 0;
  const cutoff = Date.now() - BULK_MAX_AGE_MS;
  const young = list.filter((m) => m.createdTimestamp > cutoff);
  const old = list.filter((m) => m.createdTimestamp <= cutoff);
  let n = 0;
  if (young.length) n += (await channel.bulkDelete(young, true)).size;
  for (let i = 0; i < old.length; i++) {
    const ok = await old[i]!.delete().then(() => true, () => false);
    if (ok) n++;
    if (i > 0 && i % 4 === 0) await new Promise((r) => setTimeout(r, 350));
  }
  return n;
}
