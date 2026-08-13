import type { KnoxClient } from "../client.js";
import { attachPlayer as attachMusic } from "./music-session.js";

export async function attachPlayer(client: KnoxClient) {
  await attachMusic(client);
}
