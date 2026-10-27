// A compact, always-accurate list of ZARU's real commands, built from the live registry. The AI chat and the
// assistant feed this to the model so it stops inventing commands (it kept telling members to use "!balance").
import type { KnoxClient } from "../client.js";

let cache: string | null = null;

/** e.g. "/eco balance|daily|work|fish|… · /gamble slots|blackjack|… · /rank · /lottery buy|info · …" */
export function commandList(client: KnoxClient): string {
  if (cache) return cache;
  const parts: string[] = [];
  for (const cmd of client.commands.values()) {
    const json = cmd.data.toJSON() as { name: string; options?: Array<{ name: string; type: number }> };
    const subs = (json.options ?? []).filter((o) => o.type === 1 || o.type === 2).map((o) => o.name);
    parts.push(subs.length ? `/${json.name} ${subs.slice(0, 14).join("|")}` : `/${json.name}`);
  }
  cache = parts.sort().join(" · ");
  return cache;
}
