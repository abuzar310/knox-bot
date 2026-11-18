// Mod-mail status: each conversation's thread says at a glance who is waiting for whom, and the staff are told
// about members who have waited too long. The rules follow Kira, Horizon's Discord bot (MIT licence,
// github.com/horizon-rust/kira, src/modcase-kit.js). Pure: tested without Discord (modmail-kit.test.ts).

export type MailStatus = "open" | "waiting" | "closed";

/** in front of the thread's name: the member wrote last, the staff answered, or it is over */
export const MAIL_MARK: Record<MailStatus, string> = { open: "🟢", waiting: "🟡", closed: "🔒" };
/** a member waiting this long for an answer is brought up */
export const STALE_MS = 12 * 3_600_000;
/** and not again for the same conversation within this time */
export const REMIND_GAP_MS = 24 * 3_600_000;
/** Discord allows a thread two renames in ten minutes: at most one per gap */
export const RENAME_GAP_MS = 5 * 60_000;
export const STALE_LIST_MAX = 20;

/** the status after someone spoke: a member's message opens it, a staff answer that reached them makes it waiting */
export function mailAfter(current: MailStatus, speaker: "member" | "staff", delivered = true): MailStatus {
  if (current === "closed") return "closed";
  if (speaker === "member") return "open";
  return delivered ? "waiting" : current;
}

/** the thread's name with its status in front, replacing an earlier mark */
export function mailName(name: string, status: MailStatus): string {
  const bare = name.replace(/^(?:🟢|🟡|🔒|⚪)\s*/u, "");
  return `${MAIL_MARK[status]} ${bare}`.slice(0, 100);
}

/** the conversations whose member has waited too long and was not brought up lately: oldest first, a screenful at most */
export function staleMail<T extends { status: string; statusAt: Date; remindedAt: Date | null }>(rows: readonly T[], now: number): T[] {
  return rows
    .filter((row) => row.status === "open" && now - row.statusAt.getTime() >= STALE_MS && (!row.remindedAt || now - row.remindedAt.getTime() >= REMIND_GAP_MS))
    .sort((a, b) => a.statusAt.getTime() - b.statusAt.getTime())
    .slice(0, STALE_LIST_MAX);
}

/** the reminder's text */
export function staleLine(rows: readonly { threadId: string; statusAt: Date }[]): string {
  const lines = rows.map((row) => `<#${row.threadId}> · waiting since <t:${Math.floor(row.statusAt.getTime() / 1000)}:R>`);
  return `**Mod-mail waiting for an answer for more than 12 hours:**\n${lines.join("\n")}`.slice(0, 1900);
}

/**
 * Renames within Discord's limit: the first rename of a thread goes out at once, later ones wait for the gap,
 * and only the last name asked for is used.
 */
export function makeRenamer(
  rename: (threadId: string, name: string) => Promise<void>,
  options: { gapMs?: number; now?: () => number; later?: (run: () => void, ms: number) => unknown } = {},
) {
  const gapMs = options.gapMs ?? RENAME_GAP_MS;
  const now = options.now ?? Date.now;
  const later = options.later ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const state = new Map<string, { lastAt: number; wanted: string | null }>();
  const send = (threadId: string, name: string) => {
    state.set(threadId, { lastAt: now(), wanted: null });
    void rename(threadId, name).catch(() => undefined);
  };
  return {
    /** asks for a name; true when it went out at once */
    want(threadId: string, name: string): boolean {
      const entry = state.get(threadId);
      if (!entry || now() - entry.lastAt >= gapMs) {
        send(threadId, name);
        return true;
      }
      const queued = entry.wanted !== null;
      entry.wanted = name;
      if (!queued) {
        later(() => {
          const due = state.get(threadId);
          if (due?.wanted) send(threadId, due.wanted);
        }, gapMs - (now() - entry.lastAt));
      }
      return false;
    },
    /** whether a rename could go out right now (closing must not wait behind the limit) */
    free(threadId: string): boolean {
      const entry = state.get(threadId);
      return !entry || now() - entry.lastAt >= gapMs;
    },
    /** a thread that is gone needs no pending name */
    forget(threadId: string) {
      state.delete(threadId);
    },
  };
}
