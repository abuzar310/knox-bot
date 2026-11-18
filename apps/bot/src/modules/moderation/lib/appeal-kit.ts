// A quarantined member's appeal: who may send one and when, and the words everyone sees. The flow follows Kira,
// Horizon's Discord bot (MIT licence, github.com/horizon-rust/kira, src/features/modcases.js), cut down to
// quarantine only. Pure: plain data in and out, so it is tested without Discord (appeal-kit.test.ts).

/** after a rejected appeal, this long before the same quarantine may be appealed again */
export const APPEAL_COOLDOWN_MS = 24 * 3_600_000;
export const ANSWER_MAX = 1000;
export const NOTE_MAX = 300;

export type AppealState = {
  /** the member holds the Quarantined role right now */
  quarantined: boolean;
  /** they already have an appeal awaiting a decision */
  hasOpenAppeal: boolean;
  /** when their last appeal for THIS quarantine was rejected, if any (ms) */
  lastRejectedAt: number | null;
};

export type AppealCheck = { ok: true } | { ok: false; why: "not-quarantined" | "open" | "cooldown"; retryAt?: number };

/** whether this member may open an appeal now */
export function canAppeal(state: AppealState, now: number): AppealCheck {
  if (!state.quarantined) return { ok: false, why: "not-quarantined" };
  if (state.hasOpenAppeal) return { ok: false, why: "open" };
  if (state.lastRejectedAt !== null && now - state.lastRejectedAt < APPEAL_COOLDOWN_MS) {
    return { ok: false, why: "cooldown", retryAt: state.lastRejectedAt + APPEAL_COOLDOWN_MS };
  }
  return { ok: true };
}

/** the one line a member gets when they may not appeal */
export function appealRefusal(check: Extract<AppealCheck, { ok: false }>): string {
  switch (check.why) {
    case "not-quarantined":
      return "You're not quarantined, so there's nothing to appeal.";
    case "open":
      return "You already have an appeal waiting for the moderators. Hold tight.";
    case "cooldown":
      return `Your last appeal wasn't accepted. You can send another ${check.retryAt ? `<t:${Math.ceil(check.retryAt / 1000)}:R>` : "later"}.`;
  }
}

/** trims a modal answer and keeps it within Discord's and the database's room */
export function cleanAnswer(text: string): string {
  return text.trim().slice(0, ANSWER_MAX);
}

/** both required answers have something in them */
export function bothAnswered(whatHappened: string, whyLift: string): boolean {
  return cleanAnswer(whatHappened).length > 0 && cleanAnswer(whyLift).length > 0;
}

/** the pinned message in #appeal: the member presses the button under it */
export function appealFormText(): string {
  return [
    "**You've been quarantined.**",
    "You can see only this channel until a moderator lifts it. If you think it was a mistake, press the button below to send them an appeal — it goes to the staff, not here.",
  ].join("\n\n");
}

/** the appeal as the staff see it in their review channel (never shown in #appeal) */
export function reviewText(input: { userId: string; tag: string; caseNumber: number | null; quarantinedBy: string | null; whatHappened: string; whyLift: string }): string {
  const lines = [
    `**Appeal from <@${input.userId}>** (${input.tag})${input.caseNumber ? ` · case #${input.caseNumber}` : ""}`,
    input.quarantinedBy ? `Quarantined by ${input.quarantinedBy}.` : null,
    "",
    `**What happened**\n${cleanAnswer(input.whatHappened)}`,
    "",
    `**Why it should be lifted**\n${cleanAnswer(input.whyLift)}`,
  ].filter((line) => line !== null);
  return lines.join("\n").slice(0, 4000);
}

/** the DM the member gets once a decision is made (carries the staff note) */
export function memberOutcomeText(decision: "accept" | "reject", note: string, retryAt: number): string {
  const trimmed = note.trim().slice(0, NOTE_MAX);
  if (decision === "accept") {
    return `✅ Your appeal was accepted — your roles are back and you can see the server again.${trimmed ? `\n\n*${trimmed}*` : ""}`;
  }
  return `Your appeal wasn't accepted this time.${trimmed ? `\n\n*${trimmed}*` : ""}\n\nYou can send another appeal <t:${Math.ceil(retryAt / 1000)}:R>.`;
}

/**
 * The fallback line posted in #appeal when the member's DM could not be delivered. The member shares #appeal with
 * other quarantined members, so this carries only the outcome and the retry time — never their words or the staff note.
 */
export function appealPublicOutcome(userId: string, decision: "accept" | "reject", retryAt: number): string {
  if (decision === "accept") return `<@${userId}> your appeal was accepted. Welcome back.`;
  return `<@${userId}> your appeal wasn't accepted. You can send another <t:${Math.ceil(retryAt / 1000)}:R>.`;
}

export type Decision = "accept" | "reject";

export type DecisionDeps<A> = {
  /** the id of the member's live quarantine, or null if they aren't quarantined now */
  liveQuarantineId: () => Promise<number | null>;
  /** claims the appeal: UPDATE … WHERE status = 'open' RETURNING — the row if this press won, else null */
  claim: () => Promise<A | null>;
  /** gives the member their roles back; throws if it couldn't */
  release: () => Promise<void>;
  /** puts the appeal back to open after a failed release, so a mod can try again */
  reopen: () => Promise<void>;
};

export type DecisionResult<A> =
  | { kind: "stale" }
  | { kind: "already-handled" }
  | { kind: "accepted"; appeal: A }
  | { kind: "rejected"; appeal: A }
  | { kind: "release-failed"; error: unknown };

/**
 * One moderator's decision on an appeal, with the order that keeps it safe: a decision counts only while the
 * member's live quarantine is still the one the appeal was about (so a stale Accept can't lift a later quarantine);
 * the decision is then claimed atomically (so two presses can't both land); and an accept that fails to release
 * reopens the appeal. Injected ops, so it is tested without Discord or a database.
 */
export async function runDecision<A>(deps: DecisionDeps<A>, input: { decision: Decision; appealQuarantineId: number | null }): Promise<DecisionResult<A>> {
  const live = await deps.liveQuarantineId();
  if (live === null || live !== input.appealQuarantineId) return { kind: "stale" };
  const claimed = await deps.claim();
  if (!claimed) return { kind: "already-handled" };
  if (input.decision === "reject") return { kind: "rejected", appeal: claimed };
  try {
    await deps.release();
  } catch (error) {
    await deps.reopen();
    return { kind: "release-failed", error };
  }
  return { kind: "accepted", appeal: claimed };
}
