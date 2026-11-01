import { describe, expect, it } from "vitest";
import {
  ACK_TIMEOUT_MS,
  MISSES_BEFORE_REPLACE,
  PROBE_EVERY_MS,
  REPLACE_BUDGET_PER_HOUR,
  REPLACE_COOLDOWN_MS,
  STUCK_MS,
  createGatewayWatch,
} from "./gateway-watch.js";

function missProbe(watch: ReturnType<typeof createGatewayWatch>, at: number) {
  expect(watch.tick(at, true)).toBe("probe");
  return watch.tick(at + ACK_TIMEOUT_MS, true);
}

describe("gateway watch", () => {
  it("probes after a quiet stretch and does not replace while answers arrive", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    expect(watch.tick(PROBE_EVERY_MS - 1, true)).toBe("wait");
    expect(watch.tick(PROBE_EVERY_MS, true)).toBe("probe");
    watch.onAck(PROBE_EVERY_MS + 20);
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("wait");
  });

  it("keeps the session after one late answer and replaces only after a run of misses", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    let at = PROBE_EVERY_MS;
    for (let n = 1; n < MISSES_BEFORE_REPLACE; n += 1) {
      expect(missProbe(watch, at)).toBe("wait");
      at += ACK_TIMEOUT_MS + PROBE_EVERY_MS;
    }
    expect(missProbe(watch, at)).toBe("replace");
    expect(watch.tick(at + ACK_TIMEOUT_MS + 1_000, true)).toBe("wait");
  });

  it("does not probe while the shard is not ready", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    expect(watch.tick(PROBE_EVERY_MS + 5_000, false)).toBe("wait");
  });

  it("lets a new gap replace again after the shard is ready", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    let at = PROBE_EVERY_MS;
    for (let n = 1; n < MISSES_BEFORE_REPLACE; n += 1) {
      expect(missProbe(watch, at)).toBe("wait");
      at += ACK_TIMEOUT_MS + PROBE_EVERY_MS;
    }
    expect(missProbe(watch, at)).toBe("replace");
    const readyAt = at + ACK_TIMEOUT_MS + REPLACE_COOLDOWN_MS;
    watch.onShardReady(readyAt);
    expect(watch.tick(readyAt + PROBE_EVERY_MS, true)).toBe("probe");
  });

  it("ignores a library zombie while a replace is already in progress", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    let at = PROBE_EVERY_MS;
    for (let n = 1; n < MISSES_BEFORE_REPLACE; n += 1) {
      missProbe(watch, at);
      at += ACK_TIMEOUT_MS + PROBE_EVERY_MS;
    }
    expect(missProbe(watch, at)).toBe("replace");
    expect(watch.onZombie(at + ACK_TIMEOUT_MS + 10)).toBe("ignore");
  });

  it("unsticks a library zombie when nothing else is reconnecting", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    expect(watch.onZombie(1_000)).toBe("unstick");
  });

  it("restarts after the hourly replace budget is spent", () => {
    const watch = createGatewayWatch();
    let now = 0;
    watch.onShardReady(now);
    const burn = () => {
      let at = now + PROBE_EVERY_MS;
      let action = "wait";
      for (let n = 0; n < MISSES_BEFORE_REPLACE; n += 1) {
        action = missProbe(watch, at);
        at += ACK_TIMEOUT_MS + PROBE_EVERY_MS;
      }
      now = at - PROBE_EVERY_MS;
      return action;
    };
    for (let n = 0; n < REPLACE_BUDGET_PER_HOUR; n += 1) {
      now += REPLACE_COOLDOWN_MS;
      watch.onShardReady(now);
      expect(burn()).toBe("replace");
    }
    now += REPLACE_COOLDOWN_MS;
    watch.onShardReady(now);
    expect(burn()).toBe("restart");
  });

  it("restarts when a replace never becomes ready", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    let at = PROBE_EVERY_MS;
    for (let n = 1; n < MISSES_BEFORE_REPLACE; n += 1) {
      missProbe(watch, at);
      at += ACK_TIMEOUT_MS + PROBE_EVERY_MS;
    }
    expect(missProbe(watch, at)).toBe("replace");
    const replacedAt = at + ACK_TIMEOUT_MS;
    expect(watch.tick(replacedAt + STUCK_MS, true)).toBe("replace");
    expect(watch.tick(replacedAt + STUCK_MS * 2, true)).toBe("restart");
  });
});
