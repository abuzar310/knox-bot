// Discord only notices a dead gateway socket on its next heartbeat, about 41s later.
// This watch sends its own heartbeat and treats a missing answer as a dead socket much sooner.

export const PROBE_EVERY_MS = 8_000;
export const ACK_TIMEOUT_MS = 6_000;
export const REPLACE_COOLDOWN_MS = 20_000;
export const STUCK_MS = 20_000;
export const REPLACE_BUDGET_PER_HOUR = 8;
const HOUR_MS = 60 * 60_000;

export type GatewayWatchAction = "wait" | "probe" | "replace" | "restart";

export function createGatewayWatch() {
  let lastAckAt: number | null = null;
  let lastProbeAt: number | null = null;
  let pendingSince: number | null = null;
  let stuckTries = 0;
  const replaces: number[] = [];

  function recentReplaces(now: number) {
    const kept = replaces.filter((at) => now - at < HOUR_MS);
    replaces.length = 0;
    replaces.push(...kept);
    return kept;
  }

  return {
    onAck(now: number) {
      lastAckAt = now;
    },
    onShardReady(now: number) {
      lastAckAt = now;
      lastProbeAt = null;
      pendingSince = null;
      stuckTries = 0;
    },
    /** The library is already inside its own reconnect. Do not open a second one. */
    onZombie(now: number): "ignore" | "unstick" {
      if (pendingSince) return "ignore";
      pendingSince = now;
      replaces.push(now);
      return "unstick";
    },
    tick(now: number, canProbe: boolean): GatewayWatchAction {
      if (pendingSince && now - pendingSince >= STUCK_MS) {
        pendingSince = null;
        stuckTries += 1;
        if (stuckTries >= 2) return "restart";
        pendingSince = now;
        replaces.push(now);
        return "replace";
      }
      if (pendingSince) return "wait";
      if (!canProbe || lastAckAt == null) return "wait";
      const unanswered = lastProbeAt != null && lastProbeAt > lastAckAt;
      if (!unanswered && now - lastAckAt >= PROBE_EVERY_MS) {
        lastProbeAt = now;
        return "probe";
      }
      if (unanswered && lastProbeAt != null && now - lastProbeAt >= ACK_TIMEOUT_MS) {
        const recent = recentReplaces(now);
        if (recent.length >= REPLACE_BUDGET_PER_HOUR) return "restart";
        const last = recent.at(-1);
        if (last != null && now - last < REPLACE_COOLDOWN_MS) return "wait";
        pendingSince = now;
        replaces.push(now);
        return "replace";
      }
      return "wait";
    },
  };
}
