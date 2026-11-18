// Two rules of the message filter (events/automod.ts). A brand-new account can't post links, because that is how
// most scams arrive; and an edited message is checked like a new one, so a link can't be edited in afterwards.
// The link rule follows Kira, Horizon's Discord bot (MIT licence, github.com/horizon-rust/kira,
// src/features/moderation.js). Pure: plain data in and out, so it is tested without Discord (automod-kit.test.ts).

const DAY = 86_400_000;
export const NEW_ACCOUNT_DAYS_MAX = 30;
/** how long the member's notice stays in the channel */
export const NOTICE_SHOWN_MS = 15_000;
/** one notice and one log line per member in this time: a burst of links must not become a burst of notices */
export const NOTICE_GAP_MS = 10 * 60_000;
/**
 * For a message whose old text is not known: an update this long after the edit is not the member editing
 * (Discord also sends updates for pins, previews and threads). Wide, because the host's clock may be minutes off.
 */
export const EDIT_FRESH_MS = 5 * 60_000;

/** where a link starts: an address with its scheme, a www. address, or a Discord invite */
const LINK_START = /https?:\/\/(?:www\.)?(?=\S)|(?<![\p{L}\p{N}])www\.(?=[^\s.\/]+\.[^\s.\/])|discord\.gg\/(?=\S)/giu;
/** the GIF picker posts a plain link to one of these; an account of any age may use it */
const GIF_HOSTS = ["tenor.com", "giphy.com"];

function linkStarts(text: string): number {
  return (text.match(LINK_START) ?? []).length;
}

export function hasLink(content: string): boolean {
  return linkStarts(content) > 0;
}

/** a word that is one whole link to a GIF site, and nothing glued to it */
function isGifLink(word: string): boolean {
  if (!/^https:\/\//i.test(word) || linkStarts(word) !== 1) return false;
  let host: string;
  try {
    host = new URL(word).hostname.toLowerCase();
  } catch {
    return false;
  }
  return GIF_HOSTS.some((gif) => host === gif || host.endsWith(`.${gif}`));
}

/** whether every link in the text is a GIF from the picker */
export function onlyGifLinks(content: string): boolean {
  const starts = linkStarts(content);
  return starts > 0 && content.split(/\s+/).filter(isGifLink).length === starts;
}

/** whether this is a link from an account too young to post one; `days` 0 switches the rule off */
export function newAccountLink(input: { content: string; accountCreatedAt: number; now: number; days: number }): boolean {
  if (input.days <= 0 || input.now - input.accountCreatedAt >= input.days * DAY) return false;
  return hasLink(input.content) && !onlyGifLinks(input.content);
}

/** what the member is told, with the moment their account is old enough */
export function newAccountNotice(userId: string, accountCreatedAt: number, days: number): string {
  const from = Math.ceil((accountCreatedAt + days * DAY) / 1000);
  return `<@${userId}> your message was removed: accounts younger than ${days} day${days === 1 ? "" : "s"} can't post links here yet. Yours can <t:${from}:R>.`;
}

/** true the first time a key is seen, then not again until the gap has passed */
export function makeOncePer(gapMs: number, now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return (key: string): boolean => {
    const at = now();
    const last = seen.get(key);
    if (last !== undefined && at - last < gapMs) return false;
    if (seen.size >= 5000) for (const [k, t] of seen) if (at - t >= gapMs) seen.delete(k);
    seen.set(key, at);
    return true;
  };
}

/**
 * Whether a message update is the member changing the text. When both texts are known they decide, and no clock
 * is read. `oldContent` and `newContent` are null when Discord did not send them (a message from before the last
 * restart): then the time of the edit decides.
 */
export function isRealEdit(input: { editedAt: number | null; now: number; oldContent: string | null; newContent: string | null }): boolean {
  if (input.editedAt === null) return false;
  if (input.oldContent !== null && input.newContent !== null) return input.oldContent !== input.newContent;
  return input.now - input.editedAt <= EDIT_FRESH_MS;
}
