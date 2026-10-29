// What the server owner tells ZARU sticks: a fact ("Suhaib is my brother") or a correction
// ("you should answer like these guys didn't have it, I gave them").
import { replyLanguage } from "./visibility.js";

export type Lesson = { text: string; by: string; at: string };

const TEACH = /\b(you should|you shouldn't|you should not|next time|from now on|remember that|remember this|always (?:say|name|tell|list)|don't say|do not say|answer like|should answer|i want you to)\b/i;
const FACT = /\b(is my|are my|my brother|my sister|my friend|mera bhai|meri behen)\b/i;
const ASKS = /\b(who|whom|what|which|why|kya|kaun|kisne|kis)\b/i;
const ACTION = /\b(give|ban|kick|create|delete|purge|remove|add|lock|mute|timeout|warn)\b/i;
const ABOUT_REPLY = /\b(answer|say|tell|reply|name them|list them)\b/i;

/** the sentence to store, or empty when this message is not teaching anything */
export function lessonFrom(text: string): string {
  const t = text.trim().replace(/^\?+\s*/, "");
  if (t.length < 12 || t.length > 400) return "";
  if (!TEACH.test(t) && !FACT.test(t)) return "";
  return t;
}

/** true when the message is only a fact or a way-of-speaking correction, so ZARU should not also run a plan */
export function lessonStandsAlone(text: string): boolean {
  if (/\?/.test(text) || ASKS.test(text)) return false;
  if (ACTION.test(text) && !ABOUT_REPLY.test(text)) return false;
  return true;
}

export function lessonAck(text: string): string {
  return replyLanguage(text) === "en" ? "Got it. I'll remember that." : "Theek hai. Yaad rakhunga.";
}

/** newest last, same sentence replaced, capped so the prompt stays small */
export function addLesson(existing: Lesson[], lesson: Lesson): Lesson[] {
  const key = lesson.text.toLowerCase().replace(/\s+/g, " ").trim();
  const kept = existing.filter((item) => item.text.toLowerCase().replace(/\s+/g, " ").trim() !== key);
  return [...kept, { text: lesson.text.slice(0, 400), by: lesson.by.slice(0, 40), at: lesson.at.slice(0, 40) }].slice(-30);
}

/** a block for the planner. Empty when nothing has been taught yet. */
export function lessonsBrief(lessons: Lesson[]): string {
  if (!lessons.length) return "";
  const lines = lessons.map((lesson) => `- ${lesson.text}`);
  return [
    "Lessons from the server owner. Follow them when you reply.",
    "A lesson is a fact or a way of speaking. It is not an order to ban, kick, delete, or change roles by itself.",
    ...lines,
  ].join("\n");
}
