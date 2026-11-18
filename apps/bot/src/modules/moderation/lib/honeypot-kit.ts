// The trap channel: a channel nobody has a reason to write in, with a warning on it. Whoever does is almost
// always a spam bot posting in every channel it can see, so the account is removed together with its last day
// of messages: a ban that is lifted at once, so a person caught by mistake can come back.
// The rules follow Kira, Horizon's Discord bot (MIT licence, github.com/horizon-rust/kira, src/honeypot-kit.js).
// Pure: plain data in and out, so it is tested without Discord (honeypot-kit.test.ts).

export const TRAP_CHANNEL_NAME = "do-not-type-here";
export const TRAP_TOPIC = "Do not write here. Whoever does is removed from the server at once: this channel catches spam bots.";
export const TRAP_NOTICE =
  "**Do not write in this channel.**\nIt is a trap for spam bots, which post in every channel they can see. Anyone who writes here is removed from the server at once, together with their last day of messages. If that happens to you by mistake, you can join again.";
/** one removal per member in this time: a burst of messages must not become a burst of bans */
export const TRAP_WINDOW_MS = 10 * 60_000;
/** how much of the account's history goes with it: the last day */
export const TRAP_DELETE_SECONDS = 86_400;

/** who is never removed by the trap: their message is only deleted */
export function trapExempt(who: { isStaff: boolean; isOwner: boolean; hasProtectedRole: boolean }): boolean {
  return who.isStaff || who.isOwner || who.hasProtectedRole;
}

export type TrapAction = "ignore" | "delete" | "softban";

/** what happens to a message, given where it was written and by whom */
export function trapAction(input: { trapChannelId: string | null; channelId: string; isBot: boolean; exempt: boolean; firstInWindow: boolean }): TrapAction {
  if (!input.trapChannelId || input.channelId !== input.trapChannelId) return "ignore";
  // other bots and webhooks are the server's own tools: their posts are left alone
  if (input.isBot) return "ignore";
  if (input.exempt) return "delete";
  return input.firstInWindow ? "softban" : "delete";
}

/** remembers who was already removed in the window; `claim` is true only the first time */
export function makeHandled(windowMs: number, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return {
    claim(key: string): boolean {
      const at = now();
      for (const [k, since] of seen) if (at - since >= windowMs) seen.delete(k);
      if (seen.has(key)) return false;
      seen.set(key, at);
      return true;
    },
  };
}

/** an account's age in words, for the log line: new accounts are the tell */
export function accountAge(createdTimestamp: number, now: number): string {
  const hours = Math.max(0, Math.floor((now - createdTimestamp) / 3_600_000));
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
}

/** the reason on the case and in the mod-log */
export function trapReason(input: { accountAge: string; content: string }): string {
  const text = input.content.replace(/\s+/g, " ").trim();
  const excerpt = text ? `Message: ${text.slice(0, 300)}` : "The message had no text (a file or an embed).";
  return `Wrote in the trap channel. Removed with their last day of messages; they can join again. Account age: ${input.accountAge}. ${excerpt}`;
}
