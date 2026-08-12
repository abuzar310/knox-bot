const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parse durations like `10m`, `1h`, `2d`. Max 28 days (Discord timeout cap). */
export function parseDuration(input: string): number | null {
  const match = /^(\d+)([smhd])$/i.exec(input.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = amount * UNIT_MS[unit];
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const max = 28 * UNIT_MS.d;
  return Math.min(ms, max);
}

export function formatDuration(ms: number): string {
  const d = Math.floor(ms / UNIT_MS.d);
  const h = Math.floor((ms % UNIT_MS.d) / UNIT_MS.h);
  const m = Math.floor((ms % UNIT_MS.h) / UNIT_MS.m);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${Math.max(1, Math.floor(ms / 1000))}s`);
  return parts.join(" ");
}
