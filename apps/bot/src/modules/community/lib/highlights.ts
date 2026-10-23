// Highlights: members pick words, and get a DM when someone says one where they can see it.
import { highlights } from "@knox/db";
import type { KnoxClient } from "../../../client.js";

export const MAX_WORDS = 10;
/** letters, digits, spaces and a few joiners; 2–50 characters */
export const WORD_RE = /^[\p{L}\p{N}][\p{L}\p{N} '._-]{1,49}$/u;

/** word → the members who want to hear about it */
export type GuildHighlights = Map<string, Set<string>>;

export function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** which members' words appear in this text, as whole words (case-insensitive) */
export function matchHighlights(content: string, words: GuildHighlights): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  if (!content) return hits;
  const lower = content.toLowerCase();
  for (const [word, users] of words) {
    if (!lower.includes(word)) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word)}($|[^\\p{L}\\p{N}])`, "u");
    if (!re.test(lower)) continue;
    for (const userId of users) {
      const list = hits.get(userId) ?? [];
      list.push(word);
      hits.set(userId, list);
    }
  }
  return hits;
}

export async function loadHighlights(client: KnoxClient) {
  const rows = await client.db.select().from(highlights);
  client.highlightWords.clear();
  for (const row of rows) cacheWord(client, row.guildId, row.userId, row.word);
}

export function cacheWord(client: KnoxClient, guildId: string, userId: string, word: string) {
  const guildMap = client.highlightWords.get(guildId) ?? new Map<string, Set<string>>();
  const users = guildMap.get(word) ?? new Set<string>();
  users.add(userId);
  guildMap.set(word, users);
  client.highlightWords.set(guildId, guildMap);
}

export function uncacheWord(client: KnoxClient, guildId: string, userId: string, word: string | null) {
  const guildMap = client.highlightWords.get(guildId);
  if (!guildMap) return;
  for (const [w, users] of guildMap) {
    if (word !== null && w !== word) continue;
    users.delete(userId);
    if (!users.size) guildMap.delete(w);
  }
  if (!guildMap.size) client.highlightWords.delete(guildId);
}
