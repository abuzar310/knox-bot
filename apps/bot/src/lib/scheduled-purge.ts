export type PurgeSchedule = { channelId: string; everyHours: number; lastRunAt: string | null };

/** channel ids whose timer has elapsed */
export function duePurges(rows: readonly PurgeSchedule[], now: number): string[] {
  const due: string[] = [];
  for (const row of rows) {
    if (!row.lastRunAt) {
      due.push(row.channelId);
      continue;
    }
    const last = Date.parse(row.lastRunAt);
    if (Number.isNaN(last) || now - last >= row.everyHours * 3_600_000) due.push(row.channelId);
  }
  return due;
}
