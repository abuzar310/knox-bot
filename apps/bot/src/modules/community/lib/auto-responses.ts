// Auto-responses: a trigger word or phrase and the reply ZARU gives, cached per server so each message costs a scan.
import type { GuildMember } from "discord.js";
import { autoResponses } from "@knox/db";
import type { KnoxClient } from "../../../client.js";

export type AutoResponse = typeof autoResponses.$inferSelect;
export const MATCHES = ["contains", "exact", "starts"] as const;
export type MatchKind = (typeof MATCHES)[number];
export const MAX_RESPONSES = 25;

export function normalizeTrigger(trigger: string) {
  return trigger.trim().toLowerCase().replace(/\s+/g, " ");
}

/** the first response whose trigger matches the message */
export function matchAutoResponse(content: string, rows: readonly AutoResponse[]): AutoResponse | null {
  const text = content.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const row of rows) {
    const t = row.trigger;
    if (row.match === "exact" ? text === t : row.match === "starts" ? text.startsWith(t) : text.includes(t)) return row;
  }
  return null;
}

export function renderReply(reply: string, member: GuildMember | null, authorMention: string, username: string, serverName: string) {
  return reply
    .replace(/\{user\}/g, authorMention)
    .replace(/\{username\}/g, member?.displayName ?? username)
    .replace(/\{server\}/g, serverName)
    .slice(0, 2000);
}

export async function loadAutoResponses(client: KnoxClient) {
  const rows = await client.db.select().from(autoResponses);
  client.autoResponses.clear();
  for (const row of rows) {
    const list = client.autoResponses.get(row.guildId) ?? [];
    list.push(row);
    client.autoResponses.set(row.guildId, list);
  }
}

export async function reloadGuildAutoResponses(client: KnoxClient, guildId: string) {
  const { eq } = await import("drizzle-orm");
  const rows = await client.db.select().from(autoResponses).where(eq(autoResponses.guildId, guildId));
  if (rows.length) client.autoResponses.set(guildId, rows);
  else client.autoResponses.delete(guildId);
}
