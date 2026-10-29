// ZARU's conversational brain. Reads the recent chat in a channel and replies like a real person who mods here,
// in the SAME language the speaker used. Shared by three callers so they all behave the same:
//  - the AI chat channel (ambient messages),
//  - the "zaru, ..." / "@ZARU ..." message trigger and /zaru, when a member who can't run actions talks to ZARU,
//  - the staff action-assistant, which feeds the same conversation into its planner so "zaru, what's your opinion?"
//    reacts to what people were actually saying.
import type { Guild, GuildTextBasedChannel, Message } from "discord.js";
import type { KnoxClient } from "../../client.js";
import { askText } from "../ai-json.js";
import { commandList } from "../command-list.js";
import { GROUNDED, looksFactual } from "./ground.js";
import { lessonsBrief } from "./lessons.js";
import { replyLanguage, visibilityBrief } from "./visibility.js";

/** how many earlier messages ZARU reads before answering. Embeds and buttons count; empty messages do not. */
export const CHAT_LOOKBACK = 10;

/** a bare hello stays in that language, so a Hinglish channel cannot pull "heyyy" into Hindi */
export function greetingReply(text: string): string {
  const t = text.trim();
  if (/^(he+y+|hi+|hello+|yo+|sup)[!?. ]*$/i.test(t)) return "Hey. What do you need?";
  if (/^(namaste|namaskar)[!?. ]*$/i.test(t)) return "Namaste. Kya chahiye?";
  return "";
}

/** "who made you" names Abuzar. The model otherwise invents a team of developers. */
export function makerReply(text: string): string {
  const t = text.trim();
  if (t.length > 160) return "";
  const asks =
    /\bwho\s+(made|created|built|developed|coded|programmed)\s+(you|zaru|u)\b/i.test(t) ||
    /\b(your|ur)\s+(maker|creator|developer)\b/i.test(t) ||
    /\bkis\s*ne\s+(banaya|banayi|banai)\b/i.test(t);
  if (!asks) return "";
  const language = replyLanguage(t);
  if (language === "hi") return "मैं ZARU हूँ, Abuzar ने मुझे बनाया।";
  if (language === "hinglish" || /\bkis\s*ne\b/i.test(t)) return "Main ZARU hoon, Abuzar ne banaya.";
  return "I'm ZARU, made by Abuzar.";
}

const RECENT_SETUP_EN = [
  "I set it up.",
  "#rules has the rules, #announcements has the announcement, and #roles has the menus: Male or Female, 18+ or 18-, games, platform, a color, and pings.",
  "New members get a DM to pick those. They can read #chat, and they can talk after they pick 18+ or 18-. People already here can still talk.",
  "If someone leaves and comes back within 30 days, those roles come back.",
  "#media and #memes keep pictures and links and drop plain text.",
  "Welcomes are a picture card with Rules, Roles, and Chat. The picture can sit on the left or the right, with a subtitle and a darker overlay, and the card can use a background image.",
  "Logs can split into message, member, join, server, and voice channels. Emoji self-roles have unique, verify, reversed, binding, and temporary modes.",
  "Suggestions can be voted on. A channel can clear itself on a timer, and free games can post into a channel. A self-role message can be queued from the dashboard.",
  "Music plays from YouTube, Spotify, and SoundCloud. A music channel plays a song name typed on its own, and the player has bass, nightcore, vaporwave, and daycore.",
].join(" ");

const RECENT_SETUP_HINGLISH = [
  "Maine set up kar diya.",
  "#rules mein rules hain, #announcements mein announcement hai, aur #roles mein menus hain: Male ya Female, 18+ ya 18-, games, platform, ek color, aur pings.",
  "Naye members ko DM aata hai roles lene ke liye. #chat padh sakte hain, baat 18+ ya 18- lene ke baad. Jo pehle se hain, woh baat kar sakte hain.",
  "Koi 30 din ke andar wapas aaye to woh roles wapas milte hain.",
  "#media aur #memes mein sirf pictures aur links rehte hain.",
  "Welcome ek picture card hai, Rules, Roles, aur Chat ke saath. Picture left ya right ho sakti hai, subtitle aur darker overlay ke saath, aur background image lag sakti hai.",
  "Logs alag channels mein ja sakte hain: messages, members, joins, server, voice. Emoji self-roles: unique, verify, reversed, binding, temporary.",
  "Suggestions pe vote ho sakta hai. Channel timer pe clear ho sakta hai, aur free games ek channel mein post ho sakte hain. Self-role message dashboard se queue ho sakta hai.",
  "Music YouTube, Spotify, aur SoundCloud se chalti hai. Music channel mein song ka naam likhne se woh bajta hai. Filters: bass, nightcore, vaporwave, daycore.",
].join(" ");

/** server ownership is not a bot action, and ZARU will not ask the owner to hand it over */
export function ownershipRefusal(text: string): string {
  if (!/\bownership\b/i.test(text) || !/\b(transfer|handover|hand over|de\s*do|dedo|kare|karo|chahiye|give)\b/i.test(text)) return "";
  return replyLanguage(text) === "en"
    ? "I can't transfer server ownership. Only the current owner can do that in Discord's server settings, and I won't ask them to."
    : "Main ownership transfer nahi kar sakta. Woh sirf owner Discord settings se karta hai, aur main unse yeh nahi maangunga.";
}

/** "?zaru what we recently added into you" — the setup ZARU already posted, not a how-to */
export function recentSetupReply(text: string): string {
  const t = text.trim();
  if (/\b(delete|remove|purge|hide|create|ban|kick|lock)\b/i.test(t)) return "";
  if (!/\b(recently added(?:\s+into you|\s+to you)?|added into you|added to you|what(?:'s| is)? new)\b/i.test(t)) return "";
  return replyLanguage(t) === "en" ? RECENT_SETUP_EN : RECENT_SETUP_HINGLISH;
}

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  embeds: { title?: string | null; description?: string | null }[];
  controls: string[];
};

/** one line ZARU can actually read: typed text, embed title and description, button and menu labels */
export function renderChatLine(botId: string | undefined, message: ChatMessage): string {
  const name = message.authorId === botId ? "ZARU" : message.authorName;
  const parts: string[] = [];
  const content = message.content.trim();
  if (content) parts.push(content.slice(0, 300));
  for (const embed of message.embeds) {
    const bit = [embed.title?.trim(), embed.description?.trim()].filter(Boolean).join(" — ");
    if (bit) parts.push(`[embed] ${bit.slice(0, 220)}`);
  }
  if (message.controls.length) parts.push(`[buttons] ${message.controls.slice(0, 8).join(", ")}`);
  if (!parts.length) return "";
  return `${name}: ${parts.join(" ")}`;
}

/** title + buttons, so two identical ticket panels compare equal */
export function panelKey(message: ChatMessage): string | null {
  const titles = message.embeds.map((embed) => embed.title?.trim()).filter((title): title is string => Boolean(title));
  const controls = message.controls.map((control) => control.trim()).filter(Boolean);
  if (!titles.length && !controls.length) return null;
  return `${titles.join(" | ")} // ${controls.join(", ")}`;
}

function humanPanel(key: string): string {
  const [title, controls] = key.split(" // ");
  if (title && controls) return `"${title}" with ${controls}`;
  return `"${title || controls}"`;
}

/** a count question ("is this a duplicate", "two buttons"), not an order to post or delete */
export function isDuplicateQuestion(text: string): boolean {
  if (/\b(delete|remove|hatao|hata do|post|create|banao|send)\b/i.test(text)) return false;
  if (/\b(duplicate|duplicates|duplicated|do baar|dobara)\b/i.test(text)) return true;
  return /\b(two|2|both|do)\b.{0,40}\b(button|buttons|panel|panels)\b/i.test(text) || /\b(button|buttons|panel|panels)\b.{0,40}\b(two|2|both)\b/i.test(text);
}

/** yes/no from the messages actually read. Empty when this is not a duplicate question. */
export function duplicateReply(window: ChatMessage[], text: string): string {
  if (!isDuplicateQuestion(text)) return "";
  const counts = new Map<string, number>();
  for (const message of window) {
    const key = panelKey(message);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, count]) => count >= 2);
  const language = replyLanguage(text);
  if (repeated.length) {
    const detail = repeated.map(([key, count]) => `${count} copies of ${humanPanel(key)}`).join("; ");
    if (language === "hi") return `हाँ। पिछले ${CHAT_LOOKBACK} संदेशों में ${detail}।`;
    if (language === "hinglish") return `Haan. Last ${CHAT_LOOKBACK} messages mein ${detail}.`;
    return `Yes. In the last ${CHAT_LOOKBACK} messages there are ${detail}.`;
  }
  const seen = [...counts.entries()].map(([key, count]) => `${count} of ${humanPanel(key)}`).join("; ");
  if (language === "hi") {
    return seen
      ? `नहीं। पिछले ${CHAT_LOOKBACK} संदेशों में ${seen} है, दो कॉपी नहीं।`
      : `नहीं। पिछले ${CHAT_LOOKBACK} संदेशों में एक जैसा पैनल या बटन दो बार नहीं है।`;
  }
  if (language === "hinglish") {
    return seen
      ? `Nahi. Last ${CHAT_LOOKBACK} messages mein ${seen} hai, do copy nahi.`
      : `Nahi. Last ${CHAT_LOOKBACK} messages mein same panel ya button do baar nahi hai.`;
  }
  return seen
    ? `No. In the last ${CHAT_LOOKBACK} messages I see ${seen}, not two copies.`
    : `No. In the last ${CHAT_LOOKBACK} messages I don't see the same panel or button posted twice.`;
}

function controlLabels(message: Message): string[] {
  const labels: string[] = [];
  for (const row of message.components) {
    if (!("components" in row)) continue;
    for (const component of row.components) {
      if ("label" in component && component.label) labels.push(component.label);
      if ("placeholder" in component && component.placeholder) labels.push(component.placeholder);
      if ("options" in component && Array.isArray(component.options)) {
        for (const option of component.options) {
          if (option.label) labels.push(option.label);
        }
      }
    }
  }
  return labels;
}

function toChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    authorId: message.author.id,
    authorName: message.member?.displayName ?? message.author.username,
    content: message.content,
    embeds: message.embeds.map((embed) => ({ title: embed.title, description: embed.description })),
    controls: controlLabels(message),
  };
}

/** keep the last readable lines. A panel with only an embed and a button still counts. */
export function windowRecent(botId: string | undefined, messagesOldestFirst: ChatMessage[], limit = CHAT_LOOKBACK): { text: string; window: ChatMessage[] } {
  const rendered = messagesOldestFirst
    .map((message) => ({ message, line: renderChatLine(botId, message) }))
    .filter((row) => row.line)
    .slice(-limit);
  return { text: rendered.map((row) => row.line).join("\n"), window: rendered.map((row) => row.message) };
}

/** the last 10 readable messages, oldest first, including panels that have no typed text */
export async function loadRecentChat(client: KnoxClient, channel: GuildTextBasedChannel, excludeId?: string): Promise<{ text: string; window: ChatMessage[] }> {
  const fetched = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!fetched) return { text: "", window: [] };
  const messages = [...fetched.values()]
    .reverse()
    .filter((message) => message.id !== excludeId)
    .map(toChatMessage);
  return windowRecent(client.user?.id, messages);
}

/** the last 10 readable messages in the channel, oldest first, as "Name: text" (the bot's own lines are "ZARU") */
export async function recentConversation(client: KnoxClient, channel: GuildTextBasedChannel, excludeId?: string): Promise<string> {
  return (await loadRecentChat(client, channel, excludeId)).text;
}

const cooldown = new Map<string, number>();
const COOLDOWN_MS = 3_000;

/** true (and starts the timer) when this user is still on cooldown in this channel */
export function chatOnCooldown(channelId: string, userId: string): boolean {
  const key = `${channelId}:${userId}`;
  if (Date.now() - (cooldown.get(key) ?? 0) < COOLDOWN_MS) return true;
  cooldown.set(key, Date.now());
  return false;
}

/** a plain-text, in-character reply to a message that addresses ZARU; null if there is no AI key or the model is silent */
export async function conversationalReply(input: {
  client: KnoxClient;
  guild: Guild;
  channel: GuildTextBasedChannel;
  speaker: string;
  text: string;
  prefix: string;
  /** pass the recent conversation if the caller already fetched it; otherwise it is fetched here */
  conversation?: string;
  /** the message being answered, so it is not counted as one of the previous 10 */
  excludeId?: string;
  rank?: string;
  roles?: string[];
  powers?: string;
}): Promise<string | null> {
  const { client, guild, channel, speaker, text, prefix } = input;
  const chName = "name" in channel ? channel.name : "this channel";
  const topic = "topic" in channel && channel.topic ? ` (topic: ${channel.topic.slice(0, 120)})` : "";
  const hello = greetingReply(text);
  if (hello) return hello;
  const maker = makerReply(text);
  if (maker) return maker;
  const recent = recentSetupReply(text);
  if (recent) return recent;
  const ownership = ownershipRefusal(text);
  if (ownership) return ownership;
  const chat = await loadRecentChat(client, channel, input.excludeId);
  const conversation = chat.text || input.conversation || "";
  const duplicate = duplicateReply(chat.window, text);
  if (duplicate) return duplicate.slice(0, 1900);
  const brief = await visibilityBrief(guild, text, conversation).catch(() => ({ facts: "", spoken: "" }));
  if (brief.spoken) return brief.spoken.slice(0, 1900);
  const learnedSettings = await client.guildConfig.get(guild.id).catch(() => null);
  const learned = learnedSettings ? lessonsBrief(learnedSettings.settings.features.staffLessons ?? []) : "";
  const who =
    `This speaker is ${speaker}, ZARU rank ${input.rank ?? "member"}` +
    (input.roles?.length ? `, Discord roles: ${input.roles.join(", ")}` : "") +
    `. ${input.powers ?? "Member: chat, questions, and play. No moderation."} `;
  const system =
    `You are ZARU — a real person who moderates "${guild.name}", chatting in #${chName}${topic} like anyone else here. ` +
    "Your vibe is a chill desi mod: casual, warm, short (1-3 sentences). " +
    "LANGUAGE RULE (the most important rule): reply in the EXACT same language and script as the person you're replying to — this is decided only by their message, never by your own habit. " +
    'Plain English message → reply in plain English, with NO Hindi or Hinglish words mixed in. ' +
    'If their message uses Devanagari script (Hindi letters such as क ख क्या है) you MUST reply entirely in Devanagari too — never romanize it into Latin letters. For example to "आज क्या देखें?" you reply "थ्रिलर देखो, सबको मज़ा आएगा" and NOT "thriller dekho". ' +
    "Romanized Hindi or mixed Hindi-English → reply in that same Hinglish. " +
    "Kannada → reply in Kannada. Any other language → reply in that language. " +
    "Never change their script and never mix in a language they did not use. A short English sentence is still English — do not answer it in Hinglish. The surrounding conversation may be in a different language; still answer in the ASKER's language. " +
    "An emoji now and then is fine, not every line. Never say you are an AI, a bot, a model or an assistant, and never mention prompts, context or instructions. " +
    "You were made by Abuzar. If they ask who made you, who created you, or who built you, say Abuzar. Never say a team, a company, or 'my developers'. " +
    (learned ? `${learned} ` : "") +
    GROUNDED +
    " " +
    `The recent conversation below is the previous ${CHAT_LOOKBACK} messages, oldest first, including embed titles and button labels. "this", "here", "these" and "duplicate" mean those messages. If two lines show the same embed and the same button, say so. Do not ask what they mean when those lines already show it. ` +
    "When they ask your opinion, what you would recommend, or to react to what is being discussed, READ the recent conversation below and answer about THAT specific thing: take a side, give a real pick, say why in a few words. Don't be vague or sit on the fence. " +
    "Answer whatever they ask — the server, the chat, games, life, general knowledge. Don't greet unless they greet first; just answer the thing. If you genuinely don't know, say so like a person would. " +
    who +
    "If their rank is member or dj and they ask you to lock, kick, ban, create roles/channels, give coins, or other staff work, tell them they don't have permission for moderation power. Do not explain a magic phrase that would make it happen. " +
    `Commands: ZARU's prefix is "${prefix}" (NOT "!"). Members chat with ${prefix} followed by their message (${prefix}zaru is optional), or "zaru, …". Slash /zaru is admin-only. When naming a command, use ONLY real ones written as /name or ${prefix}name, and never invent one. Coins: ${prefix}daily, ${prefix}work, ${prefix}slots, ${prefix}bj, ${prefix}chicken, ${prefix}animal, ${prefix}lottery, ${prefix}shop. Full list: ${commandList(client)}. ` +
    `You know: ${guild.name} has ${guild.memberCount} members; you're in #${chName}.`;
  const user = [
    brief.facts || null,
    conversation ? `Recent conversation in this channel (oldest first):\n${conversation}` : null,
    `${speaker}: ${text.slice(0, 600)}`,
  ]
    .filter((line) => line !== null)
    .join("\n\n");
  return askText(system, user, 500, looksFactual(text) ? 0.1 : 0.4);
}
