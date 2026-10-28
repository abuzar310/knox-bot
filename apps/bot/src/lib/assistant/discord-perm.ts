import type { KnoxRank } from "@knox/shared";

/** what ZARU says when Discord (or its own role) blocks an action */
export const NO_BOT_PERMISSION = "I don't have permission for that.";

/** what ZARU says when a regular member tries to run a staff/moderation action */
export const NO_MOD_POWER = "You don't have permission for moderation power.";

/** what ZARU says when a mod tries an owner/admin-only action */
export const NO_ADMIN_POWER = "You don't have permission for that. Ask an admin or the owner.";

/** slash /zaru is admin-only; members talk through the prefix or "zaru, …" */
export function zaruUsePrefix(prefix: string) {
  const p = prefix || "?";
  return `Slash \`/zaru\` is for admins. Members use \`${p} …\` (\`${p}zaru …\` is optional) or say \`zaru, …\`.`;
}

export function deniedByRank(have: KnoxRank, needed: KnoxRank): string {
  if (needed === "member") return "You don't have permission for that.";
  if (have === "member" || have === "dj") return NO_MOD_POWER;
  return NO_ADMIN_POWER;
}

/** true when the asker is trying to change the server, not just chat or play games */
export function isModerationAsk(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(lock|unlock|kick|ban|unban|mute|unmute|timeout|warn|purge|slowmode|raid|lockdown|prune|giveaway|automod)\b/.test(t)) return true;
  if (/\b(create|delete|clone|rename|move|hide|restrict|open|sync)\b.{0,48}\b(channel|category|role|emoji|server|permission)\b/.test(t)) return true;
  if (/\b(channel|category|role|emoji|server|permission|nickname|nick)\b.{0,48}\b(create|delete|clone|rename|move|hide|restrict|lock|unlock|set)\b/.test(t)) return true;
  if (/\b(give|take|add)\b.{0,24}\b(coins?|xp|money|cash|role)\b/.test(t)) return true;
  if (/\bset\s+(the\s+)?(server|permission|slowmode|nick|feature|prefix)/.test(t)) return true;
  return false;
}

const PERMISSION_CODES = new Set([
  50001, // Missing Access
  50013, // Missing Permissions
  50026, // missing access to a channel
  4006, // used disallowed intents
]);

export function isDiscordPermissionError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = Number((err as { code: unknown }).code);
    if (PERMISSION_CODES.has(code)) return true;
  }
  return err instanceof Error && /Missing Permissions|Missing Access|disallowed intents/i.test(err.message);
}

export function botPermissionLine(err: unknown): string {
  return isDiscordPermissionError(err) ? NO_BOT_PERMISSION : err instanceof Error ? err.message : "failed";
}
