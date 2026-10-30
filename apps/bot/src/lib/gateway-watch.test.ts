import { describe, expect, it } from "vitest";
import {
  ACK_TIMEOUT_MS,
  PROBE_EVERY_MS,
  REPLACE_BUDGET_PER_HOUR,
  REPLACE_COOLDOWN_MS,
  STUCK_MS,
  createGatewayWatch,
} from "./gateway-watch.js";

describe("gateway watch", () => {
  it("probes after a quiet stretch and does not replace while answers arrive", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    expect(watch.tick(PROBE_EVERY_MS - 1, true)).toBe("wait");
    expect(watch.tick(PROBE_EVERY_MS, true)).toBe("probe");
    watch.onAck(PROBE_EVERY_MS + 20);
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("wait");
  });

  it("replaces the socket when a probe is not answered", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    expect(watch.tick(PROBE_EVERY_MS, true)).toBe("probe");
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS - 1, true)).toBe("wait");
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("replace");
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS + 1_000, true)).toBe("wait");
  });

  it("does not probe while the shard is not ready", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    expect(watch.tick(PROBE_EVERY_MS + 5_000, false)).toBe("wait");
  });

  it("lets a new gap replace again after the shard is ready", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    watch.tick(PROBE_EVERY_MS, true);
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("replace");
    const readyAt = PROBE_EVERY_MS + ACK_TIMEOUT_MS + REPLACE_COOLDOWN_MS;
    watch.onShardReady(readyAt);
    expect(watch.tick(readyAt + PROBE_EVERY_MS, true)).toBe("probe");
  });

  it("ignores a library zombie while a replace is already in progress", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    watch.tick(PROBE_EVERY_MS, true);
    watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS, true);
    expect(watch.onZombie(PROBE_EVERY_MS + ACK_TIMEOUT_MS + 10)).toBe("ignore");
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
    for (let n = 0; n < REPLACE_BUDGET_PER_HOUR; n += 1) {
      now += REPLACE_COOLDOWN_MS;
      watch.onShardReady(now);
      expect(watch.tick(now + PROBE_EVERY_MS, true)).toBe("probe");
      expect(watch.tick(now + PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("replace");
    }
    now += REPLACE_COOLDOWN_MS;
    watch.onShardReady(now);
    expect(watch.tick(now + PROBE_EVERY_MS, true)).toBe("probe");
    expect(watch.tick(now + PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("restart");
  });

  it("restarts when a replace never becomes ready", () => {
    const watch = createGatewayWatch();
    watch.onShardReady(0);
    watch.tick(PROBE_EVERY_MS, true);
    expect(watch.tick(PROBE_EVERY_MS + ACK_TIMEOUT_MS, true)).toBe("replace");
    const stuckAt = PROBE_EVERY_MS + ACK_TIMEOUT_MS + STUCK_MS;
    expect(watch.tick(stuckAt, true)).toBe("replace");
    expect(watch.tick(stuckAt + STUCK_MS, true)).toBe("restart");
  });
});
