// What ZARU's chat AI may post, and how often it answers. A model can be talked into saying anything, so its
// answer is checked before it goes out; and each member and each server has a ceiling, so one person cannot
// spend the whole allowance. The idea follows Kira, Horizon's Discord bot (MIT licence,
// github.com/horizon-rust/kira, src/ai-kit.js). Pure: tested without Discord or a model (ai-reply-guard.test.ts).

export const REPLY_MAX = 1900;
const INVITE = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/gi;
const MASS_MENTION = /@(everyone|here)\b/gi;
const ROLE_MENTION = /<@&\d{17,20}>/g;
const ZERO_WIDTH = "​";

export type ReplyCheck = { ok: true; text: string; changed: string[] } | { ok: false; reason: string };

/** cuts at the last sentence end past the halfway mark, so a long answer does not stop mid-word */
export function capAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("\n"));
  return end >= max / 2 ? cut.slice(0, end + 1).trimEnd() : cut;
}

/**
 * The answer as it may be posted, or why it may not be. A scam link blocks the whole answer; an invite link,
 * a mass mention and a role mention are taken out of it.
 */
export function checkReply(text: string, options: { hasScamLink: (text: string) => boolean }): ReplyCheck {
  let out = text.trim();
  if (!out) return { ok: false, reason: "empty" };
  if (options.hasScamLink(out)) return { ok: false, reason: "scam link" };
  const changed: string[] = [];
  const swap = (pattern: RegExp, replacement: string, what: string) => {
    const next = out.replace(pattern, replacement);
    if (next !== out) changed.push(what);
    out = next;
  };
  swap(INVITE, "[invite link removed]", "invite link");
  swap(MASS_MENTION, `@${ZERO_WIDTH}$1`, "mass mention");
  swap(ROLE_MENTION, "@role", "role mention");
  const capped = capAtSentence(out, REPLY_MAX);
  if (capped !== out) changed.push("length");
  return { ok: true, text: capped, changed };
}

/**
 * Generous on purpose: the AI chat channel is for talking, and the 3-second pause between a member's messages
 * already slows a flood. These stop one member, or one server, from spending a whole day's allowance.
 */
export const AI_LIMITS = { perMemberPerHour: 60, perServerPerDay: 1500 } as const;
const HOUR = 3_600_000;

export type BudgetAnswer = { ok: true } | { ok: false; why: "member" | "server"; retryAt: number; firstRefusal: boolean };

/** counts the questions the chat AI answers: a sliding hour for each member, a UTC day for each server */
export function makeAiBudget(limits: { perMemberPerHour: number; perServerPerDay: number } = AI_LIMITS, now: () => number = Date.now) {
  const members = new Map<string, number[]>();
  const servers = new Map<string, { day: number; count: number }>();
  /** who was already told they are over: the notice goes out once, then ZARU stays quiet */
  const told = new Map<string, number>();
  const dayOf = (at: number) => Math.floor(at / (24 * HOUR));
  const refusal = (key: string, why: "member" | "server", retryAt: number): BudgetAnswer => {
    const firstRefusal = (told.get(key) ?? 0) < now();
    told.set(key, retryAt);
    return { ok: false, why, retryAt, firstRefusal };
  };
  return {
    /** counts one question, or says whose ceiling is reached and when it lifts */
    take(guildId: string, userId: string): BudgetAnswer {
      const at = now();
      const today = dayOf(at);
      const server = servers.get(guildId);
      const used = server?.day === today ? server.count : 0;
      if (used >= limits.perServerPerDay) return refusal(`server:${guildId}`, "server", (today + 1) * 24 * HOUR);
      const key = `${guildId}:${userId}`;
      const recent = (members.get(key) ?? []).filter((t) => at - t < HOUR);
      if (recent.length >= limits.perMemberPerHour) {
        members.set(key, recent);
        return refusal(`member:${key}`, "member", recent[0]! + HOUR);
      }
      recent.push(at);
      members.set(key, recent);
      servers.set(guildId, { day: today, count: used + 1 });
      return { ok: true };
    },
    usedToday(guildId: string): number {
      const server = servers.get(guildId);
      return server?.day === dayOf(now()) ? server.count : 0;
    },
  };
}

/** the one line a member gets the first time they are over; null afterwards, so the notice is not spam either */
export function budgetNotice(answer: BudgetAnswer): string | null {
  if (answer.ok || !answer.firstRefusal) return null;
  const when = `<t:${Math.ceil(answer.retryAt / 1000)}:R>`;
  return answer.why === "member" ? `That's a lot of questions for one hour. Ask me again ${when}.` : `I've answered as much as I can in this server today. I'm back ${when}.`;
}
