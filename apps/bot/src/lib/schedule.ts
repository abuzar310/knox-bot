// When a recurring post runs next: interval repeats are aligned to an anchor time of day (00:00 UTC unless given),
// daily and weekly repeats run at the given UTC time. Pure, so the arithmetic is testable.

export const REPEATS = ["hourly", "6h", "12h", "daily", "weekly"] as const;
export type Repeat = (typeof REPEATS)[number];

export type ScheduleRule = { repeat: Repeat; atUtc: string | null; weekday: number | null };

const INTERVAL_MS: Partial<Record<Repeat, number>> = { hourly: 3_600_000, "6h": 6 * 3_600_000, "12h": 12 * 3_600_000 };
const DAY_MS = 86_400_000;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "HH:MM" (24 h) → hours and minutes, or null when it isn't a time */
export function parseTimeUtc(input: string | null | undefined): { h: number; m: number } | null {
  const match = input?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/** the first run strictly after `after` */
export function nextRun(rule: ScheduleRule, after: Date): Date {
  const anchor = parseTimeUtc(rule.atUtc) ?? { h: rule.repeat === "daily" || rule.repeat === "weekly" ? 9 : 0, m: 0 };
  const interval = INTERVAL_MS[rule.repeat];
  const dayStart = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), anchor.h, anchor.m);
  if (interval) {
    // start a day before the anchor so the loop also covers times earlier today
    let t = dayStart - DAY_MS;
    while (t <= after.getTime()) t += interval;
    return new Date(t);
  }
  let t = dayStart;
  while (t <= after.getTime() || (rule.repeat === "weekly" && rule.weekday !== null && new Date(t).getUTCDay() !== rule.weekday)) t += DAY_MS;
  return new Date(t);
}

export function describeRule(rule: ScheduleRule) {
  const at = rule.atUtc ? ` at ${rule.atUtc} UTC` : "";
  switch (rule.repeat) {
    case "hourly":
      return `every hour${rule.atUtc ? ` (from ${rule.atUtc} UTC)` : ""}`;
    case "6h":
      return `every 6 hours${rule.atUtc ? ` (from ${rule.atUtc} UTC)` : ""}`;
    case "12h":
      return `every 12 hours${rule.atUtc ? ` (from ${rule.atUtc} UTC)` : ""}`;
    case "daily":
      return `daily${at || " at 09:00 UTC"}`;
    case "weekly":
      return `every ${rule.weekday === null ? "week" : WEEKDAYS[rule.weekday]}${at || " at 09:00 UTC"}`;
    default:
      return rule.repeat;
  }
}
