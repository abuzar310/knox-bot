import type { ServerBlueprint } from "./server-blueprint.js";

type Pending = {
  userId: string;
  guildId: string;
  blueprint: ServerBlueprint;
  expiresAt: number;
};

const pending = new Map<string, Pending>();
const TTL_MS = 10 * 60 * 1000;

export function pendingTemplateKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

export function setPendingTemplate(guildId: string, userId: string, blueprint: ServerBlueprint) {
  const now = Date.now();
  for (const [key, value] of pending) {
    if (value.expiresAt < now) pending.delete(key);
  }
  pending.set(pendingTemplateKey(guildId, userId), {
    userId,
    guildId,
    blueprint,
    expiresAt: now + TTL_MS,
  });
}

export function takePendingTemplate(guildId: string, userId: string) {
  const key = pendingTemplateKey(guildId, userId);
  const value = pending.get(key);
  if (!value) return null;
  pending.delete(key);
  if (value.expiresAt < Date.now()) return null;
  return value.blueprint;
}
