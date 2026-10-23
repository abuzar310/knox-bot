// What a server is for: every channel gets a purpose, staff roles are spotted, problems are listed and a tidy-up is
// proposed. The AI does it when a key exists; plain rules do a decent job without one and fill any gaps.
import { askJson } from "./ai-json.js";
import type { ChannelInfo, ServerSnapshot } from "./server-scan.js";

export const PURPOSES = [
  "welcome",
  "rules",
  "announcements",
  "general",
  "logs",
  "staff",
  "support",
  "suggestions",
  "media",
  "bot-commands",
  "introductions",
  "events",
  "music",
  "voice",
  "other",
] as const;
export type Purpose = (typeof PURPOSES)[number];

export type TidyAction = { action: "create_channel"; name: string; purpose: Purpose } | { action: "categorize"; channelId: string; category: string };

export type Analysis = {
  summary: string;
  purposes: Record<string, Purpose>;
  staffRoleIds: string[];
  issues: string[];
  tidy: TidyAction[];
  source: "ai" | "rules";
};

/** fancy-font names ("𝚆𝚎𝚕𝚌𝚘𝚖𝚎", "𝙰𝚗𝚗𝚘𝚞𝚗𝚌𝚖𝚎𝚗𝚝") become plain letters; decorations and marks are dropped */
export function plainName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NAME_RULES: Array<[Purpose, RegExp]> = [
  ["welcome", /welcome|join|arrivals|lobby|entrance/i],
  ["rules", /rule|guideline|info|read-?me|faq|about/i],
  ["announcements", /announc|news|update|notice|patch/i],
  ["logs", /log|audit|mod-?log|modlog/i],
  ["staff", /staff|mod|admin|team|private|backstage|internal/i],
  ["support", /support|ticket|help|report/i],
  ["suggestions", /suggest|idea|feedback|request/i],
  ["media", /media|meme|art|clip|photo|pic|screenshot|video|gallery/i],
  ["bot-commands", /bot|command|spam/i],
  ["introductions", /intro|about-?me/i],
  ["events", /event|giveaway|tournament|schedule/i],
  ["music", /music|song|dj/i],
  ["general", /general|chat|lounge|talk|main|off-?topic/i],
];

export function classifyChannelName(name: string, kind: ChannelInfo["kind"], topic?: string | null): Purpose {
  const plain = plainName(name);
  if (kind === "voice" || kind === "stage") return /music|dj/i.test(plain) ? "music" : "voice";
  if (kind === "announcement") return "announcements";
  const haystack = `${plain} ${topic ?? ""}`;
  for (const [purpose, re] of NAME_RULES) if (re.test(haystack)) return purpose;
  return "other";
}

export function heuristicAnalysis(snapshot: ServerSnapshot): Analysis {
  const purposes: Record<string, Purpose> = {};
  for (const c of snapshot.channels) {
    let purpose = classifyChannelName(c.name, c.kind, c.topic);
    // a hidden text channel with a staff-ish name is staff space even if the name also matched something else
    if (!c.everyoneCanView && (purpose === "general" || purpose === "other")) purpose = "staff";
    purposes[c.id] = purpose;
  }
  if (snapshot.rulesChannelId && purposes[snapshot.rulesChannelId]) purposes[snapshot.rulesChannelId] = "rules";
  const staffRoleIds = snapshot.roles.filter((r) => !r.managed && (r.admin || r.manageGuild || r.manageMessages || r.kickOrBan) && r.members > 0).map((r) => r.id);
  return { summary: "", purposes, staffRoleIds, issues: [], tidy: [], source: "rules" };
}

function haveOf(analysis: Analysis, purpose: Purpose) {
  return Object.values(analysis.purposes).includes(purpose);
}

/** rule-based issues and tidy actions, added to whatever the AI said and deduplicated */
function completeAnalysis(snapshot: ServerSnapshot, analysis: Analysis): Analysis {
  const rules = heuristicAnalysis(snapshot);
  for (const c of snapshot.channels) if (!analysis.purposes[c.id]) analysis.purposes[c.id] = rules.purposes[c.id] ?? "other";
  if (!analysis.staffRoleIds.length) analysis.staffRoleIds = rules.staffRoleIds;
  const issues = new Set(analysis.issues.map((i) => i.trim()).filter(Boolean));
  const tidy: TidyAction[] = [...analysis.tidy];
  const addCreate = (name: string, purpose: Purpose, why: string) => {
    if (haveOf(analysis, purpose) || tidy.some((t) => t.action === "create_channel" && t.purpose === purpose)) return;
    issues.add(why);
    tidy.push({ action: "create_channel", name, purpose });
  };
  addCreate("rules", "rules", "There is no rules channel; new members have nothing to read first.");
  addCreate("announcements", "announcements", "There is no announcements channel for server-wide news.");
  const uncategorized = snapshot.channels.filter((c) => !c.parentId && c.kind !== "category");
  if (uncategorized.length >= 3) {
    issues.add(`${uncategorized.length} channels sit outside any category, which makes the sidebar hard to read.`);
    for (const c of uncategorized) {
      if (tidy.some((t) => t.action === "categorize" && t.channelId === c.id)) continue;
      const purpose = analysis.purposes[c.id] ?? "other";
      const category = purpose === "voice" || purpose === "music" ? "Voice" : purpose === "staff" || purpose === "logs" ? "Staff" : purpose === "rules" || purpose === "announcements" || purpose === "welcome" ? "Info" : "Community";
      tidy.push({ action: "categorize", channelId: c.id, category });
    }
  }
  const dead = snapshot.channels.filter((c) => (c.kind === "text" || c.kind === "announcement") && c.lastActivityDays !== null && c.lastActivityDays > 90);
  if (dead.length) issues.add(`${dead.length} text channel${dead.length === 1 ? " has" : "s have"} had no message for over 90 days: ${dead.slice(0, 5).map((c) => `#${c.name}`).join(", ")}${dead.length > 5 ? "…" : ""}.`);
  if (!analysis.staffRoleIds.length) issues.add("No role has moderator powers (Manage Messages, Kick, Ban); staff can only be the server owner.");
  if (!snapshot.automodRules.length) issues.add("Discord's AutoMod has no rules yet.");
  return { ...analysis, issues: [...issues].slice(0, 8), tidy: tidy.slice(0, 40) };
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    channels: { type: "array", items: { type: "object", properties: { id: { type: "string" }, purpose: { type: "string", enum: [...PURPOSES] } }, required: ["id", "purpose"] } },
    staffRoleIds: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    tidy: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create_channel", "categorize"] },
          name: { type: "string" },
          purpose: { type: "string", enum: [...PURPOSES] },
          channelId: { type: "string" },
          category: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  required: ["summary", "channels", "staffRoleIds", "issues", "tidy"],
};

const SYSTEM =
  "You are the brain of ZARU, a Discord server bot. You get a server's structure as JSON. " +
  "Classify the purpose of every text, announcement and forum channel from its name, topic, category and visibility. " +
  "Name the staff roles: roles whose members moderate (admin, manage server, manage messages, kick/ban), by id. " +
  "List up to 6 concrete issues in plain words: missing essentials (rules, announcements, a staff log, support), channels outside categories, channels with no activity for 90+ days, duplicate purposes, odd permissions. " +
  "Propose tidy actions ONLY of these two kinds: create_channel (name + purpose) for a missing rules, announcements, suggestions or support channel; categorize (channelId + short Title Case category name) for channels that have no category. Never delete, rename or move channels that already have a category. " +
  "Write a two-sentence summary of what this server is about and how healthy it looks. Use the ids exactly as given.";

type AiAnswer = { summary?: string; channels?: Array<{ id?: string; purpose?: string }>; staffRoleIds?: string[]; issues?: string[]; tidy?: Array<Record<string, string>> };

export async function analyzeServer(snapshot: ServerSnapshot): Promise<Analysis> {
  const compact = {
    name: snapshot.name,
    members: snapshot.memberCount,
    ageDays: snapshot.createdDaysAgo,
    system: snapshot.systemChannelId,
    rules: snapshot.rulesChannelId,
    categories: snapshot.categories.map((c) => c.name),
    channels: snapshot.channels.map((c) => ({ id: c.id, name: c.name, plain: plainName(c.name), kind: c.kind, category: c.parentName, topic: c.topic, hidden: !c.everyoneCanView, readOnly: c.everyoneCanView && !c.everyoneCanSend, quietDays: c.lastActivityDays })),
    roles: snapshot.roles.slice(0, 40).map((r) => ({ id: r.id, name: r.name, members: r.members, admin: r.admin, manageGuild: r.manageGuild, manageMessages: r.manageMessages, kickOrBan: r.kickOrBan, managed: r.managed })),
    bots: snapshot.bots,
    automodRules: snapshot.automodRules,
  };
  const answer = await askJson<AiAnswer>(SYSTEM, JSON.stringify(compact), SCHEMA, 3000);
  if (!answer) return completeAnalysis(snapshot, { ...heuristicAnalysis(snapshot), summary: "" });
  const ids = new Set(snapshot.channels.map((c) => c.id));
  const roleIds = new Set(snapshot.roles.map((r) => r.id));
  const purposes: Record<string, Purpose> = {};
  for (const entry of answer.channels ?? []) {
    if (entry.id && ids.has(entry.id) && (PURPOSES as readonly string[]).includes(entry.purpose ?? "")) purposes[entry.id] = entry.purpose as Purpose;
  }
  const tidy: TidyAction[] = [];
  for (const t of answer.tidy ?? []) {
    if (t.action === "create_channel" && t.name && (PURPOSES as readonly string[]).includes(t.purpose ?? "")) tidy.push({ action: "create_channel", name: t.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "channel", purpose: t.purpose as Purpose });
    if (t.action === "categorize" && t.channelId && ids.has(t.channelId) && t.category) tidy.push({ action: "categorize", channelId: t.channelId, category: t.category.trim().slice(0, 60) });
  }
  return completeAnalysis(snapshot, {
    summary: (answer.summary ?? "").trim().slice(0, 600),
    purposes,
    staffRoleIds: (answer.staffRoleIds ?? []).filter((id) => roleIds.has(id)),
    issues: (answer.issues ?? []).map((i) => String(i).slice(0, 200)).slice(0, 6),
    tidy,
    source: "ai",
  });
}

/** text-like channels with a purpose, most useful first (public before hidden, active before quiet) */
export function channelsFor(snapshot: ServerSnapshot, analysis: Analysis, purpose: Purpose, kinds: ChannelInfo["kind"][] = ["text", "announcement"]): ChannelInfo[] {
  return snapshot.channels
    .filter((c) => analysis.purposes[c.id] === purpose && kinds.includes(c.kind))
    .sort((a, b) => Number(b.everyoneCanView) - Number(a.everyoneCanView) || (a.lastActivityDays ?? 9999) - (b.lastActivityDays ?? 9999));
}
