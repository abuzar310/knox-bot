/** Discord allows ten crossposts per announcement channel per hour; a sliding window keeps ZARU under it */
export class PublishLimiter {
  private readonly stamps = new Map<string, number[]>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 60 * 60_000,
  ) {}

  /** true when a publish may go ahead now (and it is counted); false when the hour's allowance is used up */
  take(channelId: string, now = Date.now()): boolean {
    const recent = (this.stamps.get(channelId) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.stamps.set(channelId, recent);
      return false;
    }
    recent.push(now);
    this.stamps.set(channelId, recent);
    return true;
  }
}
