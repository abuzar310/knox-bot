import { describe, expect, it } from "vitest";
import { cutGatewaySocket, dropGatewaySession, replaceGatewayShard, resumeGatewayShard } from "./gateway-recover.js";
import type { KnoxClient } from "../client.js";

function fakeClient() {
  const connection = {
    onclose: () => undefined,
    terminated: false,
    terminate() {
      this.terminated = true;
    },
  };
  const shard = {
    sessionInfo: { sequence: 4, sessionId: "abc" } as unknown,
    connection,
    destroyed: null as { reason?: string; recover?: number } | null,
    destroy(options: { reason?: string; recover?: number }) {
      this.destroyed = options;
      return Promise.resolve();
    },
  };
  const client = {
    ws: {
      shards: new Map([[0, shard]]),
      _ws: { strategy: { shards: new Map([[0, shard]]) } },
    },
  };
  return { client: client as unknown as KnoxClient, connection, shard };
}

describe("gateway recover", () => {
  it("drops the socket without waiting for a close handshake", () => {
    const { client, connection } = fakeClient();
    expect(cutGatewaySocket(client, 0)).toBe(true);
    expect(connection.terminated).toBe(true);
    expect(connection.onclose).toBeNull();
  });

  it("clears the session and asks for a fresh identify", async () => {
    const { client, shard } = fakeClient();
    await replaceGatewayShard(client, 0, "heartbeat ack timeout");
    expect(shard.sessionInfo).toBeNull();
    expect(shard.destroyed).toEqual({ reason: "heartbeat ack timeout", recover: 0 });
  });

  it("resumes without clearing the session", async () => {
    const { client, shard } = fakeClient();
    await resumeGatewayShard(client, 0, "missed messages");
    expect(shard.sessionInfo).toEqual({ sequence: 4, sessionId: "abc" });
    expect(shard.destroyed).toEqual({ reason: "missed messages", recover: 1 });
  });

  it("clears a session on its own", () => {
    const { client, shard } = fakeClient();
    dropGatewaySession(client, 0);
    expect(shard.sessionInfo).toBeNull();
  });
});
