// "ZARU, do this": the instruction, the server as the model sees it, a plan, a permission-checked run, a report.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import { randomUUID } from "node:crypto";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../../client.js";
import { knoxEmbed } from "../../interactions/embed.js";
import { resolveKnoxRank } from "../../permissions/resolve.js";
import { askJson, type AskOptions } from "../ai-json.js";
import { aiProvider } from "../ai-moderation.js";
import { PLAN_SCHEMA, describeAction, needsConfirmation, sanitizePlan, type Action } from "./actions.js";
import { serverContext } from "./context.js";
import { executePlan } from "./execute.js";
import { SETTINGS, TOGGLES } from "./settings-map.js";

export const AGENT_PREFIX = "knox:agent:";
const PENDING_TTL_MS = 5 * 60_000;
const COOLDOWN_MS = 3_000;

export type PendingPlan = { guildId: string; userId: string; channelId: string; instruction: string; actions: Action[]; expires: number };

const SETTING_NAMES = Object.keys(SETTINGS).join(", ");
const TOGGLE_NAMES = Object.keys(TOGGLES)
  .filter((k) => !k.startsWith("module_"))
  .join(", ");

export const SYSTEM = [
  "You are ZARU, an assistant that manages a Discord server on behalf of its staff. A staff member gives an instruction in plain language (any language, often Hinglish).",
  "Turn it into the smallest plan of concrete actions from the allowed types. For channels, categories, roles and members that already exist, prefer their exact id from the server context; their exact name also works. Never invent ids.",
  "For things the plan creates, use the exact name the staff member gave (do not add words like 'Role' or 'Channel'), and let later actions in the same plan refer to them by that same name.",
  "At most 10 actions. If the instruction is a question about the server or about ZARU's settings, answer it in `reply` from the context with no actions. If it is unclear, or asks for something outside the allowed actions, say so in `reply` with no actions.",
  "`reply` is one or two short friendly sentences in the same language as the instruction, saying what you are doing or asking what is unclear.",
  "Channel actions: create_channel (name, kind text|voice|announcement, category, role = only that role can see it, topic); create_category (name); rename_channel (channel, name); move_channel (channel, category); delete_channel (channel); clone_channel (channel, name); set_topic (channel, topic); set_slowmode (channel, seconds); set_nsfw (channel, enabled); set_user_limit (voice channel, amount); set_channel_position (channel, name top|bottom or amount); sync_permissions (channel: follow its category again); lock_channel / unlock_channel (channel: everyone can't / can write); restrict_channel (channel, role: only that role can see and talk, hidden from everyone else); open_channel (channel: visible to everyone again); set_permission (channel, role or member, permission, enabled: true = allow, false = deny, omitted = back to default; permission words: view, send, history, attach, embed, react, external_emojis, connect, speak, stream, manage_messages, mention_everyone, threads, commands, polls, invite); create_thread (channel, name, text = first message).",
  "Role actions: create_role (name, color hex, hoist, mentionable); edit_role (role, name, color, hoist, mentionable); delete_role (role); move_role (role, other = the reference role, kind above|below); give_role / remove_role (member, role); give_role_all / remove_role_all (role: every human member).",
  "Member actions: set_nickname (member, name; no name = reset); warn (member, reason: a logged warning with a case number); kick / ban (member, reason); unban (member = name or id); timeout (member, minutes, reason); untimeout (member); voice_mute / voice_deafen (member, enabled); voice_disconnect (member); voice_move (member, channel = a voice channel); dm_member (member, text).",
  "Message actions: purge (channel, amount up to 100, member = only that member's messages); pin_last (channel, amount = how many recent messages); send_message (channel, text); send_embed (channel, name = title, text); send_poll (channel, name = the question, text = options separated by |, minutes = how long it stays open); create_invite (channel, minutes = expiry with 0 = never, amount = max uses); create_event (name, when = ISO 8601 date-time using the offset from the Now line, minutes = duration, channel = a voice channel if any, topic = the place for events outside Discord, text = description).",
  `Server actions: set_server_name (name); set_verification (name none|low|medium|high|highest); lockdown_server (reason: locks every public channel) / end_lockdown; raid_mode (enabled, minutes); prune_inactive (amount = days; members with no role who were inactive that long are removed); configure (name = one of: ${SETTING_NAMES}; plus channel, category or role; enabled false = turn that setting off); set_feature (name = one of: ${TOGGLE_NAMES}, or a ZARU module name; enabled).`,
  "Rules: 'under / in / inside <category>' fills the category argument. 'post / say / send / write / announce <text> in <channel>' is send_message with that exact text, never a topic. 'Create a role for channel X so only that role can view it' is create_role then restrict_channel with that role. 'lock', 'mute the channel' or 'pause chat' is lock_channel; 'lock the whole server / everything' is lockdown_server. 'timeout / mute <member>' is timeout, 10 minutes unless told otherwise; 'mute <member> in voice' is voice_mute. 'archive <channel>' is move_channel under a category called Archive (create_category first if the context has none) and then lock_channel. 'make <channel> read-only' is lock_channel. 'hide <channel> from <role>' is set_permission view false for that role; 'let <role> see / post in <channel>' is set_permission view / send true. 'where do logs go', 'is X on' and similar are questions: answer from the zaru part of the context.",
  "The channel the instruction was given in is named in the 'Given in channel' line. When the instruction says 'this channel', 'here', 'yahan', 'idhar', 'is channel', or names no channel for a channel or message action, set channel to the word here.",
  "If a role, channel or member the instruction names is not in the server context and the instruction does not ask to create it, say so in `reply` and return no actions. Never ban, kick, prune or lock down unless the instruction clearly asks for exactly that.",
  'Example: "create a channel called plans under Community and post \\"planning starts here\\" in it" → {"reply":"Creating #plans under Community and posting your message.","actions":[{"type":"create_channel","args":{"name":"plans","kind":"text","category":"Community"}},{"type":"send_message","args":{"channel":"plans","text":"planning starts here"}}]}',
  'Example: "create a role for the xyz channel, only that role can view it" → {"reply":"Making a role called xyz and hiding #xyz from everyone else.","actions":[{"type":"create_role","args":{"name":"xyz"}},{"type":"restrict_channel","args":{"channel":"xyz","role":"xyz"}}]}',
  'Example: "make this channel visible only for the Mods role" → {"reply":"Hiding this channel from everyone except Mods.","actions":[{"type":"restrict_channel","args":{"channel":"here","role":"Mods"}}]}',
  'Example: "create role named raiders and this role can view and chat here" → {"reply":"Creating raiders and making this channel theirs.","actions":[{"type":"create_role","args":{"name":"raiders"}},{"type":"restrict_channel","args":{"channel":"here","role":"raiders"}}]}',
  'Example: "rename this channel to chit-chat" → {"reply":"Renaming this channel to chit-chat.","actions":[{"type":"rename_channel","args":{"channel":"here","name":"chit-chat"}}]}',
  'Example: "hide this channel from the Member role" → {"reply":"Hiding this channel from Member.","actions":[{"type":"set_permission","args":{"channel":"here","role":"Member","permission":"view","enabled":false}}]}',
  'Example: "poll here: pizza or burger? 1 hour" → {"reply":"Poll is up!","actions":[{"type":"send_poll","args":{"channel":"here","name":"Pizza or burger?","text":"Pizza | Burger","minutes":60}}]}',
  'Example (Now: 2026-10-26T21:00:00+05:30): "movie night tomorrow 8pm in Lounge" → {"reply":"Movie night is on the calendar.","actions":[{"type":"create_event","args":{"name":"Movie night","when":"2026-10-27T20:00:00+05:30","minutes":120,"channel":"Lounge"}}]}',
  'Example: "send welcome messages in #hello" → {"reply":"Welcome messages will go to #hello.","actions":[{"type":"configure","args":{"name":"welcome_channel","channel":"hello"}}]}',
  'Example: "turn off music" → {"reply":"Music is off.","actions":[{"type":"set_feature","args":{"name":"music","enabled":false}}]}',
  'Example: "warn Rahul for spamming" → {"reply":"Rahul ko warn kar raha hoon.","actions":[{"type":"warn","args":{"member":"Rahul","reason":"spamming"}}]}',
  'Example: "Rahul ko kick karo, spam kar raha hai" → {"reply":"Rahul ko kick kar raha hoon.","actions":[{"type":"kick","args":{"member":"Rahul","reason":"spam kar raha hai"}}]}',
  'Example: "how many voice channels do we have?" → {"reply":"There are 3 voice channels: Lounge, Music and Gaming.","actions":[]}',
].join(" ");

/** JSON mode without constrained decoding: the lite model mirrors the examples above far better than it fills a fixed schema */
export const PLANNER_ASK: AskOptions = { enforceSchema: false };

/** local date-time with its offset, e.g. 2026-10-26T21:00:00+05:30, so the model can place "tomorrow 8pm" */
export function isoWithOffset(d: Date) {
  const offset = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const local = new Date(d.getTime() + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${offset >= 0 ? "+" : "-"}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

/** the user turn the planner sees: who asks, where, when, what, and the server */
export function plannerInput(input: { memberName: string; memberId: string; channelName: string; channelId: string; instruction: string; context: string; now?: Date }) {
  const now = input.now ?? new Date();
  return `Staff member: ${input.memberName} (id ${input.memberId}).\nGiven in channel: #${input.channelName} (id ${input.channelId}); the word "here" means this channel.\nNow: ${isoWithOffset(now)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).\nInstruction: ${input.instruction.slice(0, 1500)}\n\nServer context:\n${input.context}`;
}

/** staff = ZARU admin/mod rank, Manage Server, or any moderation power; each action is then checked on its own */
export async function mayCommand(client: KnoxClient, member: GuildMember) {
  if (member.id === member.guild.ownerId) return true;
  const powers = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers];
  if (powers.some((p) => member.permissions.has(p))) return true;
  const cached = await client.guildConfig.get(member.guild.id);
  return hasMinRank(resolveKnoxRank(member, cached.permissionRows), "mod");
}

function resultEmbed(color: string, title: string, reply: string, lines: string[]) {
  const embed = knoxEmbed(color).setTitle(title);
  const body = [reply, lines.length ? "" : null, ...lines].filter((l) => l !== null).join("\n").trim();
  if (body) embed.setDescription(body.slice(0, 4000));
  return embed;
}

/** returns what to send back (the caller decides whether it is a reply or an edit) */
export async function handleInstruction(client: KnoxClient, member: GuildMember, channel: GuildTextBasedChannel, instruction: string) {
  const guild = member.guild;
  const cached = await client.guildConfig.get(guild.id);
  const color = cached.settings.embedColor;
  if (!aiProvider()) {
    return { embeds: [resultEmbed(color, "ZARU", "I can't understand instructions without an AI key on my host (GEMINI_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY).", [])] };
  }
  const key = `${guild.id}:${member.id}`;
  if (Date.now() - (client.assistantCooldown.get(key) ?? 0) < COOLDOWN_MS) {
    return { embeds: [resultEmbed(color, "ZARU", "One thing at a time; try again in a moment.", [])] };
  }
  client.assistantCooldown.set(key, Date.now());

  const context = await serverContext(guild, cached.settings);
  const raw = await askJson<unknown>(SYSTEM, plannerInput({ memberName: member.displayName, memberId: member.id, channelName: channel.name, channelId: channel.id, instruction, context }), PLAN_SCHEMA, 2000, PLANNER_ASK);
  if (!raw) return { embeds: [resultEmbed(color, "ZARU", "I couldn't think that through right now (the AI didn't answer). Try again in a minute.", [])] };
  const plan = sanitizePlan(raw);
  if (!plan.actions.length) return { embeds: [resultEmbed(color, "ZARU", plan.reply || "Nothing to do.", [])] };

  if (needsConfirmation(plan.actions)) {
    const id = randomUUID().slice(0, 8);
    client.assistantPending.set(id, { guildId: guild.id, userId: member.id, channelId: channel.id, instruction, actions: plan.actions, expires: Date.now() + PENDING_TTL_MS });
    const lines = plan.actions.map((a) => `• ${describeAction(a)}`);
    return {
      embeds: [resultEmbed(color, "ZARU · confirm?", `${plan.reply}\n\nThis can't be undone, so press Confirm:`, lines).setFooter({ text: "Only the person who asked can confirm · expires in 5 minutes" })],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`${AGENT_PREFIX}ok:${id}`).setLabel("Confirm").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`${AGENT_PREFIX}no:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
  }
  const outcomes = await executePlan(client, guild, member, channel, plan.actions);
  return { embeds: [resultEmbed(color, "ZARU", plan.reply, outcomes.map((o) => `${o.ok ? "✅" : "❌"} ${o.line}`))] };
}

/** the Confirm / Cancel buttons under a pending plan */
export async function runPending(client: KnoxClient, id: string, member: GuildMember, channel: GuildTextBasedChannel): Promise<{ embeds: ReturnType<typeof resultEmbed>[] } | { error: string }> {
  const pending = client.assistantPending.get(id);
  if (!pending || pending.expires < Date.now()) return { error: "That request has expired; ask again." };
  if (pending.userId !== member.id) return { error: "Only the person who asked can confirm this." };
  client.assistantPending.delete(id);
  const cached = await client.guildConfig.get(member.guild.id);
  const outcomes = await executePlan(client, member.guild, member, channel, pending.actions);
  return { embeds: [resultEmbed(cached.settings.embedColor, "ZARU", `Done with "${pending.instruction.slice(0, 120)}":`, outcomes.map((o) => `${o.ok ? "✅" : "❌"} ${o.line}`))] };
}
