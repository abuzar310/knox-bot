// Who can actually see a channel. The chat model was guessing ("the whole King's Space category")
// and inventing channels. This reads Discord's permission overwrites and hands the model the list.
import { ChannelType, PermissionFlagsBits, type Guild, type GuildBasedChannel, type GuildMember, type Role } from "discord.js";

const VISIBILITY = /\b(dekh\w*|see|sees|seen|visible|visibility|view|access|hidden|hide|permission)\b/i;
const PRONOUN = /\b(vo|woh|wo|he|she|they|him|her|them)\b/i;

/** "King's Space" and "king space" become the same words */
export function stemWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/** true when the name's words appear in order in the text, so "king space" matches "King's Space" */
export function nameInText(name: string, text: string): boolean {
  const words = stemWords(name);
  if (!words.length || words.join("").length < 3) return false;
  const hay = stemWords(text);
  for (let i = 0; i <= hay.length - words.length; i++) {
    if (words.every((word, j) => hay[i + j] === word)) return true;
  }
  return false;
}

export function asksAboutVisibility(text: string): boolean {
  return VISIBILITY.test(text);
}

/** a question about what someone can see — not an order like "hide this channel" */
export function isVisibilityQuestion(text: string): boolean {
  if (!asksAboutVisibility(text)) return false;
  const order = /\b(hide|unhide|lock|unlock|create|delete|restrict|sync|banao|hatao|hata do|band kar)\b/i.test(text);
  if (order && /\b(hide|unhide|lock|unlock|create|delete|restrict|banao|hatao)\b/i.test(text)) return false;
  return /\?/.test(text) || /\b(can|could|does|do|did|kya|kaun|check|dekh\w*|see|sees|seen|visible|visibility|view|access)\b/i.test(text);
}

export type ReplyLanguage = "en" | "hinglish" | "hi";

export function replyLanguage(text: string): ReplyLanguage {
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/\b(hai|hain|nahi|nahin|kya|kyun|kaise|sakta|sakti|sakte|wala|wale|wali|andar|sirf|dekh\w*|kare|karo|merko|mujhe|usko)\b/i.test(text)) return "hinglish";
  return "en";
}

function joinNames(names: string[], language: ReplyLanguage): string {
  if (names.length <= 1) return names[0] ?? "";
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(", ");
  return language === "en" ? `${rest} and ${last}` : `${rest} aur ${last}`;
}

function subjectWho(label: string): { kind: "role" | "member"; name: string } {
  const role = /^Role (.+?):?$/.exec(label);
  if (role) return { kind: "role", name: role[1]!.trim() };
  const member = /^Member ([^(]+)/.exec(label);
  if (member) return { kind: "member", name: member[1]!.trim() };
  return { kind: "member", name: label.replace(/:$/, "") };
}

/** a reply built only from the computed list, so the model cannot add channels that are not there */
export function speakVisibility(subjects: VisibilitySubject[], text: string): string {
  const language = replyLanguage(text);
  const lines: string[] = [];
  for (const subject of subjects) {
    const who = subjectWho(subject.label);
    for (const category of subject.categories) {
      const visible = category.channels.filter((channel) => channel.visible === true).map((channel) => labelChannel(channel));
      const hidden = category.channels.filter((channel) => channel.visible === false).map((channel) => labelChannel(channel));
      const unknown = category.channels.filter((channel) => channel.visible === null).length;
      lines.push(sentence(language, who, category.name, category.visible, visible, hidden, unknown));
    }
  }
  return lines.join("\n").slice(0, 1900);
}

function sentence(
  language: ReplyLanguage,
  who: { kind: "role" | "member"; name: string },
  category: string,
  categoryVisible: boolean | null,
  visible: string[],
  hidden: string[],
  unknown: number,
): string {
  const vis = visible.length ? joinNames(visible, language) : "";
  const hid = hidden.length ? joinNames(hidden, language) : "";
  if (language === "hi") {
    const person = who.kind === "role" ? `${who.name} रोल` : who.name;
    const cat =
      categoryVisible === false
        ? `${person} को ${category} कैटेगरी नहीं दिखती।`
        : categoryVisible === true
          ? `${person} को ${category} कैटेगरी दिखती है।`
          : `${person} को ${category} कैटेगरी दिखती है या नहीं, पता नहीं।`;
    const inside = vis ? `अंदर दिखते हैं: ${vis}।` : unknown ? "अंदर कौन से चैनल दिखते हैं, पता नहीं।" : "अंदर कोई चैनल नहीं दिखता।";
    const hide = hid ? `छिपे हैं: ${hid}।` : "";
    return [cat, inside, hide].filter(Boolean).join(" ");
  }
  if (language === "hinglish") {
    const person = who.kind === "role" ? `${who.name} role` : who.name;
    const cat =
      categoryVisible === false
        ? `${person} ${category} category nahi dekh sakta.`
        : categoryVisible === true
          ? `${person} ${category} category dekh sakta hai.`
          : `${person} ${category} category dikhti hai ya nahi, pata nahi.`;
    const inside = vis ? `Andar visible: ${vis}.` : unknown ? "Andar kaun se channel visible hain, pata nahi." : "Andar koi channel visible nahi.";
    const hide = hid ? `Hidden: ${hid}.` : "";
    return [cat, inside, hide].filter(Boolean).join(" ");
  }
  const person = who.kind === "role" ? `The ${who.name} role` : who.name;
  const cat =
    categoryVisible === false
      ? `${person} cannot see the ${category} category.`
      : categoryVisible === true
        ? `${person} can see the ${category} category.`
        : `Whether ${person} can see the ${category} category is unknown.`;
  const inside = vis ? `Visible inside: ${vis}.` : unknown ? "Which channels inside are visible is unknown." : "No channel inside it is visible.";
  const hide = hid ? `Hidden: ${hid}.` : "";
  return [cat, inside, hide].filter(Boolean).join(" ");
}

export type VisibilityChannel = { name: string; kind: string; visible: boolean | null };
export type VisibilityCategory = { name: string; visible: boolean | null; channels: VisibilityChannel[] };
export type VisibilitySubject = { label: string; categories: VisibilityCategory[] };

export function formatVisibility(subjects: VisibilitySubject[]): string {
  if (!subjects.length) return "";
  const lines = [
    "Visibility facts (computed just now from Discord permission overwrites — answer ONLY from these lines, never invent a channel, and never say a whole category is visible when only some of its channels are):",
  ];
  for (const subject of subjects) {
    lines.push(subject.label);
    for (const category of subject.categories) {
      const visible = category.channels.filter((c) => c.visible === true).map((c) => labelChannel(c));
      const hidden = category.channels.filter((c) => c.visible === false).map((c) => labelChannel(c));
      const categoryState = category.visible === true ? "category itself visible" : category.visible === false ? "category itself hidden" : "category visibility unknown";
      lines.push(
        `  ${category.name}: ${categoryState}. Visible channels: ${visible.length ? visible.join(", ") : "none"}. Hidden channels: ${hidden.length ? hidden.join(", ") : "none"}.`,
      );
    }
  }
  return lines.join("\n").slice(0, 3500);
}

function labelChannel(channel: VisibilityChannel): string {
  return channel.kind === "text" ? `#${channel.name}` : `#${channel.name} (${channel.kind})`;
}

type Named = { id: string; name: string };

/** "member role" counts; "king space" alone does not, or a category with the same name would be treated as the role */
function roleNamed(name: string, text: string): boolean {
  const words = stemWords(name);
  if (!words.length || words.join("").length < 3) return false;
  const hay = stemWords(text);
  for (let i = 0; i <= hay.length - words.length; i++) {
    if (!words.every((word, j) => hay[i + j] === word)) continue;
    const around = hay.slice(Math.max(0, i - 3), i + words.length + 3);
    if (around.includes("role")) return true;
  }
  return false;
}

/** roles and members the question is about; pronouns fall back to the last name in the recent chat */
export function matchSubjects(input: {
  text: string;
  conversation?: string;
  roles: Named[];
  members: Named[];
}): { roles: string[]; members: string[] } {
  const text = input.text;
  const roleIds = new Set<string>();
  const memberIds = new Set<string>();
  for (const match of text.matchAll(/<@&(\d+)>/g)) roleIds.add(match[1]!);
  for (const match of text.matchAll(/<@!?(\d+)>/g)) memberIds.add(match[1]!);
  for (const role of input.roles) {
    if (roleNamed(role.name, text)) roleIds.add(role.id);
  }
  for (const member of input.members) {
    if (nameInText(member.name, text)) memberIds.add(member.id);
  }
  if (!roleIds.size && !memberIds.size && PRONOUN.test(text) && input.conversation) {
    const mentioned = [...input.conversation.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]!).pop();
    if (mentioned) memberIds.add(mentioned);
    else {
      const named = [...input.members].reverse().find((member) => nameInText(member.name, input.conversation!));
      if (named) memberIds.add(named.id);
    }
  }
  return { roles: [...roleIds], members: [...memberIds] };
}

export function matchCategories(names: Named[], text: string, conversation?: string): string[] {
  const blob = conversation ? `${text}\n${conversation}` : text;
  return names.filter((category) => nameInText(category.name, blob)).map((category) => category.id);
}

function kindOf(channel: GuildBasedChannel): string {
  if (channel.type === ChannelType.GuildVoice) return "voice";
  if (channel.type === ChannelType.GuildStageVoice) return "stage";
  if (channel.type === ChannelType.GuildAnnouncement) return "announcement";
  if (channel.type === ChannelType.GuildForum) return "forum";
  return "text";
}

function canView(channel: GuildBasedChannel, subject: GuildMember | Role): boolean | null {
  if (!("permissionsFor" in channel)) return null;
  const perms = channel.permissionsFor(subject);
  if (!perms) return null;
  return perms.has(PermissionFlagsBits.ViewChannel);
}

export type VisibilityBrief = { facts: string; spoken: string };

/** facts for the model, and a spoken answer that does not go through the model */
export async function visibilityBrief(guild: Guild, text: string, conversation?: string): Promise<VisibilityBrief> {
  if (!asksAboutVisibility(text)) return { facts: "", spoken: "" };
  await guild.channels.fetch().catch(() => undefined);
  if (guild.members.cache.size < Math.min(guild.memberCount, 200)) {
    await guild.members.fetch({ limit: 200 }).catch(() => undefined);
  }
  for (const id of text.matchAll(/<@!?(\d+)>/g)) {
    if (!guild.members.cache.has(id[1]!)) await guild.members.fetch(id[1]!).catch(() => undefined);
  }

  const roles = [...guild.roles.cache.values()].filter((role) => role.id !== guild.id && !role.managed);
  const members = [...guild.members.cache.values()].filter((member) => !member.user.bot);
  const categories = [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildCategory);
  const picked = matchSubjects({
    text,
    conversation,
    roles: roles.map((role) => ({ id: role.id, name: role.name })),
    members: members.map((member) => ({ id: member.id, name: member.displayName || member.user.username })),
  });
  const categoryIds = new Set(matchCategories(categories.map((category) => ({ id: category.id, name: category.name })), text, conversation));

  const subjects: Array<{ label: string; subject: GuildMember | Role }> = [];
  for (const id of picked.roles) {
    const role = guild.roles.cache.get(id);
    if (role) subjects.push({ label: `Role ${role.name}:`, subject: role });
  }
  for (const id of picked.members) {
    const member = guild.members.cache.get(id);
    if (!member) continue;
    const roleNames = member.roles.cache.filter((role) => role.id !== guild.id).map((role) => role.name);
    subjects.push({ label: `Member ${member.displayName} (roles: ${roleNames.join(", ") || "none"}):`, subject: member });
  }
  if (!subjects.length && categoryIds.size) {
    const everyone = guild.roles.everyone;
    subjects.push({ label: `Role ${everyone.name}:`, subject: everyone });
    for (const role of roles) {
      const touched = [...categoryIds].some((id) => overwriteTouches(guild, id, role.id));
      if (touched) subjects.push({ label: `Role ${role.name}:`, subject: role });
    }
  }
  if (!subjects.length) {
    const names = categories.map((category) => category.name).slice(0, 20);
    const line = names.length
      ? `Visibility facts: no member or role in that question matched. Categories here: ${names.join(", ")}.`
      : "";
    const language = replyLanguage(text);
    const spoken = !isVisibilityQuestion(text)
      ? ""
      : !names.length
        ? ""
        : language === "hi"
          ? `किस सदस्य या रोल की बात है, समझ नहीं आया। कैटेगरी: ${names.join(", ")}।`
          : language === "hinglish"
            ? `Kaun sa member ya role hai, match nahi hua. Categories: ${names.join(", ")}.`
            : `I couldn't match a member or role in that question. Categories here: ${names.join(", ")}.`;
    return { facts: line, spoken };
  }

  const focused = categoryIds.size ? categories.filter((category) => categoryIds.has(category.id)) : categories;
  const report: VisibilitySubject[] = subjects.slice(0, 6).map(({ label, subject }) => ({
    label,
    categories: focused.slice(0, 8).map((category) => ({
      name: category.name,
      visible: canView(category, subject),
      channels: childChannels(guild, category.id).map((channel) => ({
        name: channel.name,
        kind: kindOf(channel),
        visible: canView(channel, subject),
      })),
    })),
  }));
  const facts = formatVisibility(report);
  return { facts, spoken: isVisibilityQuestion(text) ? speakVisibility(report, text) : "" };
}

/** real view list for the members and roles named in the question; empty string when this isn't a visibility question */
export async function visibilityReport(guild: Guild, text: string, conversation?: string): Promise<string> {
  return (await visibilityBrief(guild, text, conversation)).facts;
}

function positionOf(channel: GuildBasedChannel): number {
  return "rawPosition" in channel ? channel.rawPosition : 0;
}

function childChannels(guild: Guild, categoryId: string): GuildBasedChannel[] {
  return [...guild.channels.cache.values()]
    .filter((channel) => !channel.isThread() && channel.type !== ChannelType.GuildCategory && channel.parentId === categoryId)
    .sort((a, b) => positionOf(a) - positionOf(b));
}

function overwriteTouches(guild: Guild, categoryId: string, roleId: string): boolean {
  const channels = [guild.channels.cache.get(categoryId), ...childChannels(guild, categoryId)];
  return channels.some((channel) => channel && "permissionOverwrites" in channel && channel.permissionOverwrites.cache.has(roleId));
}
