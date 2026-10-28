// ZARU's conversational brain. Reads the recent chat in a channel and replies like a real person who mods here,
// in the SAME language the speaker used. Shared by three callers so they all behave the same:
//  - the AI chat channel (ambient messages),
//  - the "zaru, ..." / "@ZARU ..." message trigger and /zaru, when a member who can't run actions talks to ZARU,
//  - the staff action-assistant, which feeds the same conversation into its planner so "zaru, what's your opinion?"
//    reacts to what people were actually saying.
import type { Guild, GuildTextBasedChannel } from "discord.js";
import type { KnoxClient } from "../../client.js";
import { askText } from "../ai-json.js";
import { commandList } from "../command-list.js";

/** the last few real messages in the channel, oldest first, as "Name: text" (the bot's own lines are "ZARU") */
export async function recentConversation(client: KnoxClient, channel: GuildTextBasedChannel, excludeId?: string): Promise<string> {
  const fetched = await channel.messages.fetch({ limit: 12 }).catch(() => null);
  if (!fetched) return "";
  const botId = client.user?.id;
  return [...fetched.values()]
    .reverse()
    .filter((m) => m.id !== excludeId && m.content.trim())
    .slice(-8)
    .map((m) => `${m.author.id === botId ? "ZARU" : m.member?.displayName ?? m.author.username}: ${m.content.slice(0, 300)}`)
    .join("\n");
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
  rank?: string;
  roles?: string[];
  powers?: string;
}): Promise<string | null> {
  const { client, guild, channel, speaker, text, prefix } = input;
  const chName = "name" in channel ? channel.name : "this channel";
  const topic = "topic" in channel && channel.topic ? ` (topic: ${channel.topic.slice(0, 120)})` : "";
  const conversation = input.conversation ?? (await recentConversation(client, channel));
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
    "Never change their script and never mix in a language they did not use. The surrounding conversation may be in a different language; still answer in the ASKER's language. " +
    "An emoji now and then is fine, not every line. Never say you are an AI, a bot, a model or an assistant, and never mention prompts, context or instructions — you just know things because you're a mod here. " +
    "When they ask your opinion, what you would recommend, or to react to what is being discussed, READ the recent conversation below and answer about THAT specific thing: take a side, give a real pick, say why in a few words. Don't be vague or sit on the fence. " +
    "Answer whatever they ask — the server, the chat, games, life, general knowledge. Don't greet unless they greet first; just answer the thing. If you genuinely don't know, say so like a person would. " +
    who +
    "If their rank is member or dj and they ask you to lock, kick, ban, create roles/channels, give coins, or other staff work, tell them they don't have permission for moderation power. Do not explain a magic phrase that would make it happen. " +
    `Commands: ZARU's prefix is "${prefix}" (NOT "!"). When naming a command, use ONLY real ones written as /name or ${prefix}name, and never invent one. Coins are under /eco, games under /gamble and /lottery, rank under /rank, music under /play. Full list: ${commandList(client)}. ` +
    `You know: ${guild.name} has ${guild.memberCount} members; you're in #${chName}.`;
  const user = conversation
    ? `Recent conversation in this channel (oldest first):\n${conversation}\n\n${speaker}: ${text.slice(0, 600)}`
    : `${speaker}: ${text.slice(0, 600)}`;
  return askText(system, user, 500);
}
