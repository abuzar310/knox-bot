// The gateway socket on this VM can go quiet without a TCP close. ws.terminate()
// drops that socket immediately so discord.js can identify again in this process.
import type { KnoxClient } from "../client.js";

type SocketLike = { terminate?: () => void; onclose?: unknown };
type InnerShard = {
  connection: SocketLike | null;
  destroy?: (options: { reason?: string; recover?: number }) => Promise<void>;
};

/** discord.js WebSocketShardDestroyRecovery.Reconnect — clears the session and identifies */
const RECONNECT = 0;
/** keep the session and resume it, so Discord does not show a new login */
const RESUME = 1;

function innerShard(client: KnoxClient, shardId: number): InnerShard | undefined {
  const ws = client.ws as unknown as {
    _ws?: { strategy?: { shards?: { get(id: number): InnerShard | undefined } } };
  };
  return ws._ws?.strategy?.shards?.get(shardId);
}

export function cutGatewaySocket(client: KnoxClient, shardId: number): boolean {
  const connection = innerShard(client, shardId)?.connection;
  if (!connection || typeof connection.terminate !== "function") return false;
  connection.onclose = null;
  connection.terminate();
  return true;
}

export function dropGatewaySession(client: KnoxClient, shardId: number) {
  const shard = client.ws.shards.get(shardId) as { sessionInfo?: unknown } | undefined;
  if (shard) shard.sessionInfo = null;
}

/** Replace one dead shard. recover 0 makes the next login an identify, not a resume. */
export async function replaceGatewayShard(client: KnoxClient, shardId: number, reason: string) {
  const shard = innerShard(client, shardId);
  if (!shard?.destroy) return;
  cutGatewaySocket(client, shardId);
  dropGatewaySession(client, shardId);
  await shard.destroy({ reason, recover: RECONNECT });
}

/** The socket is answering heartbeats but dropping messages. Resume the same session. */
export async function resumeGatewayShard(client: KnoxClient, shardId: number, reason: string) {
  const shard = innerShard(client, shardId);
  if (!shard?.destroy) return;
  cutGatewaySocket(client, shardId);
  await shard.destroy({ reason, recover: RESUME });
}
