// One automod rule against one message. The event handler counts spam and duplicates; this only decides the hit.

export const AUTOMOD_KINDS = ["spam", "invites", "links", "caps", "emoji", "mentions", "words", "duplicates", "attachments"] as const;
export type AutomodKind = (typeof AUTOMOD_KINDS)[number];
export type AutomodAction = "delete" | "warn" | "timeout" | "kick" | "ban";

export type AutomodRule = {
  id: string;
  enabled: boolean;
  kind: AutomodKind;
  action: AutomodAction;
  timeoutMinutes: number;
  threshold: number;
  windowSec: number;
  words: string[];
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
};

export type MessageFacts = {
  content: string;
  channelId: string;
  roleIds: string[];
  mentionCount: number;
  attachmentCount: number;
  recentCount: number;
  recentDuplicate: boolean;
};

const INVITE = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)[a-z0-9-]+/i;
const LINK = /https?:\/\/[^\s]+/i;

export function ruleHits(rule: AutomodRule, facts: MessageFacts): boolean {
  if (!rule.enabled) return false;
  if (rule.ignoredChannelIds.includes(facts.channelId)) return false;
  if (rule.ignoredRoleIds.some((id) => facts.roleIds.includes(id))) return false;
  switch (rule.kind) {
    case "spam":
      return facts.recentCount >= rule.threshold;
    case "invites":
      return INVITE.test(facts.content);
    case "links":
      return LINK.test(facts.content);
    case "caps": {
      const letters = facts.content.replace(/[^a-zA-Z]/g, "");
      if (letters.length < 8) return false;
      const percent = (letters.replace(/[^A-Z]/g, "").length / letters.length) * 100;
      return percent >= rule.threshold;
    }
    case "emoji": {
      const custom = (facts.content.match(/<a?:\w+:\d+>/g) ?? []).length;
      const unicode = (facts.content.match(/\p{Extended_Pictographic}/gu) ?? []).length;
      return custom + unicode >= rule.threshold;
    }
    case "mentions":
      return facts.mentionCount >= rule.threshold;
    case "words": {
      const lower = facts.content.toLowerCase();
      return rule.words.some((word) => word.length > 1 && lower.includes(word.toLowerCase()));
    }
    case "duplicates":
      return facts.recentDuplicate;
    case "attachments":
      return facts.attachmentCount >= rule.threshold;
    default:
      return false;
  }
}

export function firstHit(rules: readonly AutomodRule[], facts: MessageFacts): AutomodRule | null {
  return rules.find((rule) => ruleHits(rule, facts)) ?? null;
}
