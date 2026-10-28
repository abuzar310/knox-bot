/** commands a role must not be granted. Deny is still allowed. */
export const GRANT_BLOCKED = new Set(["set-rank-role", "safety", "ban", "tempban"]);

export function normalizeCommandName(raw: string) {
  return raw.trim().toLowerCase().replace(/^\//, "").split(/\s+/)[0] ?? "";
}

export function grantBlocked(commandName: string) {
  return GRANT_BLOCKED.has(commandName);
}
