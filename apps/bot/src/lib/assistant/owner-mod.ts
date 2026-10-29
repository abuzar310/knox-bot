// abuzarking1 and suhaibking can ban someone who wears the Owner role, or take that role off,
// even when it sits level with Suhaib. The Discord server owner stays out of reach.
import { replyLanguage } from "./visibility.js";

/** LUCIFER HOMETOWN: Abuzar (abuzarking1) and Suhaib (suhaibking). */
export const OWNER_MOD_USER_IDS = new Set(["959328052519772200", "800265791043534848"]);

/** ₪》│Owner. A role whose whole name is "owner" counts too, if this id is ever recreated. */
export const OWNER_ROLE_ID = "1069316960392847491";

const PRONOUN = /\b(usko|unko|use|usey|uska|unka|isko|him|her|them)\b/i;

const FILLER = new Set([
  "ban",
  "banned",
  "banning",
  "karo",
  "kare",
  "kar",
  "do",
  "de",
  "dena",
  "dedo",
  "dede",
  "ko",
  "se",
  "ka",
  "ki",
  "ke",
  "from",
  "the",
  "a",
  "an",
  "owner",
  "role",
  "remove",
  "removing",
  "hatao",
  "hata",
  "please",
  "pls",
  "abhi",
  "usko",
  "unko",
  "use",
  "usey",
  "uska",
  "unka",
  "isko",
  "him",
  "her",
  "them",
  "his",
  "their",
  "of",
  "zaru",
  "and",
  "to",
  "off",
  "le",
  "lo",
  "nikal",
  "lelo",
  "wale",
  "wala",
  "wali",
  "member",
  "this",
  "that",
  "for",
  "with",
  "bhai",
  "bro",
]);

export type OwnerModKind = "ban" | "remove_owner_role";

export type OwnerModOrder = { kind: OwnerModKind; target: string; pronoun: boolean };

type RoleLike = { id: string; name: string };
type RoleCache = { has(id: string): boolean; values?: () => Iterable<RoleLike> };
export type OwnerModTarget = { id: string; user?: { bot?: boolean }; roles: { cache: RoleCache } };

export function isOwnerMod(userId: string): boolean {
  return OWNER_MOD_USER_IDS.has(userId);
}

export function isOwnerRole(role: RoleLike): boolean {
  if (role.id === OWNER_ROLE_ID) return true;
  const name = role.name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
  return name === "owner";
}

export function findOwnerRoleId(roles: Iterable<RoleLike>): string | null {
  let named: string | null = null;
  for (const role of roles) {
    if (role.id === OWNER_ROLE_ID) return role.id;
    if (!named && isOwnerRole(role)) named = role.id;
  }
  return named;
}

export function wearsOwnerRole(target: { roles: { cache: RoleCache } }): boolean {
  if (target.roles.cache.has(OWNER_ROLE_ID)) return true;
  const values = target.roles.cache.values;
  if (!values) return false;
  for (const role of values()) {
    if (isOwnerRole(role)) return true;
  }
  return false;
}

/** ban of a peer who wears Owner. Never yourself, the Discord server owner, or a bot. */
export function ownerRolePeerBan(invokerId: string, target: OwnerModTarget, guildOwnerId: string): boolean {
  if (!isOwnerMod(invokerId)) return false;
  if (invokerId === target.id || target.id === guildOwnerId) return false;
  if (target.user?.bot) return false;
  return wearsOwnerRole(target);
}

/** the last person the channel was talking about, for "ban him" / "usko" */
export function personFromChat(conversation: string, askerName = ""): string {
  const mention = [...conversation.matchAll(/<@!?(\d{17,20})>/g)].pop();
  if (mention?.[1]) return mention[1];
  const at = [...conversation.matchAll(/@([a-z0-9._]{2,32})/gi)].pop();
  if (at?.[1]) return at[1];
  const paren = [...conversation.matchAll(/\(([a-z0-9._]{2,32})\)/g)].pop();
  if (paren?.[1]) return paren[1];
  const asker = askerName.trim().toLowerCase();
  const authors = [...conversation.matchAll(/^([^:\n]{2,40}):\s+\S/gm)]
    .map((match) => match[1]!.trim())
    .filter((name) => {
      const low = name.toLowerCase();
      return low !== "zaru" && low !== asker;
    });
  return authors.at(-1) ?? "";
}

function extractTarget(text: string): { name: string; pronoun: boolean } {
  const mention = text.match(/<@!?(\d{17,20})>/);
  if (mention?.[1]) return { name: mention[1], pronoun: false };
  const at = text.match(/@([a-z0-9._]{2,32})/i);
  if (at?.[1]) return { name: at[1], pronoun: false };
  const words = text
    .replace(/[^\p{L}\p{N}_.@'-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word.toLowerCase()) && !/^\d+$/.test(word));
  const name = words[0] ?? "";
  return { name, pronoun: !name && PRONOUN.test(text) };
}

/** A plain ban, or taking the Owner role off someone. Empty for a question, a refusal, or a mixed order. */
export function parseOwnerModOrder(text: string): OwnerModOrder | null {
  const t = text.trim();
  if (!t) return null;
  if (/\b(unban|don't|dont|do not|nahi|nahin)\b/i.test(t) || /\bmat\b/i.test(t)) return null;
  if (/^\s*(who|what|why|when|where|kya|kaun|kyun|kaise)\b/i.test(t)) return null;

  const ban = /\bbans?\b/i.test(t);
  const remove = /\b(remove|removing|hatao|hata|nikal|lelo|strip)\b/i.test(t) && /\bowner\b/i.test(t);
  if (ban && remove) return null;
  if (!ban && !remove) return null;

  const picked = extractTarget(t);
  if (!picked.name && !picked.pronoun) return null;
  return { kind: ban ? "ban" : "remove_owner_role", target: picked.name, pronoun: picked.pronoun };
}

export function ownerModReply(kind: OwnerModKind, name: string, text: string, wearsOwner = true): string {
  const hinglish = replyLanguage(text) !== "en";
  if (kind === "ban") {
    if (!wearsOwner) return hinglish ? `${name} ko ban kar raha hoon.` : `Banning ${name}.`;
    return hinglish ? `${name} ke paas Owner role hai, ban kar raha hoon.` : `Banning ${name}. They have the Owner role.`;
  }
  return hinglish ? `${name} se Owner role hata raha hoon.` : `Taking the Owner role off ${name}.`;
}

export function ownerModAskWho(text: string): string {
  return replyLanguage(text) === "en" ? "Who? Say their name." : "Kaun? Naam bolo.";
}

export function ownerModMissing(name: string, text: string): string {
  return replyLanguage(text) === "en" ? `I can't find ${name}.` : `${name} nahi mila.`;
}

export function ownerModNoRole(name: string, text: string): string {
  return replyLanguage(text) === "en" ? `${name} doesn't have the Owner role.` : `${name} ke paas Owner role nahi hai.`;
}

export function ownerModServerOwner(text: string): string {
  return replyLanguage(text) === "en" ? "I can't take roles off the server owner." : "Server owner se role nahi hata sakta.";
}

export function ownerModCantBanOwner(text: string): string {
  return replyLanguage(text) === "en" ? "I can't ban the server owner." : "Server owner ko ban nahi kar sakta.";
}

export function ownerModCantBanSelf(text: string): string {
  return replyLanguage(text) === "en" ? "I can't ban you." : "Khud ko ban nahi kar sakta.";
}

export function ownerModNoOwnerRole(text: string): string {
  return replyLanguage(text) === "en" ? "There's no Owner role on this server." : "Is server par Owner role nahi hai.";
}
