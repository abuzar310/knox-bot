import type { GuildTextBasedChannel, Message } from "discord.js";

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
