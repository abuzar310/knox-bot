// "ZARU, do this": the instruction, the server as the model sees it, a plan, a permission-checked run, a report.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import { randomUUID } from "node:crypto";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../../client.js";
import { knoxEmbed } from "../../interactions/embed.js";
import { resolveKnoxRank } from "../../permissions/resolve.js";
import { askJson } from "../ai-json.js";
import { aiProvider } from "../ai-moderation.js";
import { PLAN_SCHEMA, describeAction, needsConfirmation, sanitizePlan, type Action } from "./actions.js";
import { serverContext } from "./context.js";
import { executePlan } from "./execute.js";

export const AGENT_PREFIX = "knox:agent:";
const PENDING_TTL_MS = 5 * 60_000;
const COOLDOWN_MS = 3_000;

export type PendingPlan = { guildId: string; userId: string; channelId: string; instruction: string; actions: Action[]; expires: number };

export const SYSTEM = [
  "You are ZARU, an assistant that manages a Discord server on behalf of its staff. A staff member gives an instruction in plain language (any language, often Hinglish).",
  "Turn it into the smallest plan of concrete actions from the allowed types. For channels, categories, roles and members that already exist, prefer their exact id from the server context; their exact name also works. Never invent ids.",
  "For things the plan creates, use the exact name the staff member gave (do not add words like 'Role' or 'Channel'), and let later actions in the same plan refer to them by that same name.",
  "At most 10 actions. If the instruction is a question about the server, answer it in `reply` with no actions. If it is unclear, or asks for something outside the allowed actions, say so in `reply` with no actions.",
  "`reply` is one or two short friendly sentences in the same language as the instruction, saying what you are doing or asking what is unclear.",
  "Action meanings: create_channel (name, kind text|voice|announcement, category, role = only that role can see it, topic); create_category (name); create_role (name, color hex, hoist, mentionable); restrict_channel (channel, role: only that role can see it); open_channel (channel: visible to everyone again); rename_channel (channel, name); move_channel (channel, category); set_topic (channel, topic); set_slowmode (channel, seconds); lock_channel / unlock_channel (channel); delete_channel (channel); give_role / remove_role (member, role); delete_role (role); set_nickname (member, name); kick / ban (member, reason); timeout (member, minutes, reason); untimeout (member); purge (channel, amount up to 100); send_message (channel, text).",
  "Rules: 'under / in / inside <category>' fills the category argument. 'post / say / send / write / announce <text> in <channel>' is a send_message action with that exact text, never a topic. 'Create a role for channel X so only that role can view it' is create_role followed by restrict_channel with that role. 'lock', 'mute the channel' or 'pause chat' is lock_channel. 'timeout / mute <member>' is timeout, 10 minutes unless told otherwise. When no channel is named, lock/unlock/purge/slowmode/send_message mean the channel the instruction was given in, so leave channel out.",
  'Example: "create a channel called plans under Community and post \\"planning starts here\\" in it" → {"reply":"Creating #plans under Community and posting your message.","actions":[{"type":"create_channel","args":{"name":"plans","kind":"text","category":"Community"}},{"type":"send_message","args":{"channel":"plans","text":"planning starts here"}}]}',
  'Example: "create a role for the xyz channel, only that role can view it" → {"reply":"Making a role called xyz and hiding #xyz from everyone else.","actions":[{"type":"create_role","args":{"name":"xyz"}},{"type":"restrict_channel","args":{"channel":"xyz","role":"xyz"}}]}',
  'Example: "Rahul ko kick karo, spam kar raha hai" → {"reply":"Rahul ko kick kar raha hoon.","actions":[{"type":"kick","args":{"member":"Rahul","reason":"spam kar raha hai"}}]}',
  'Example: "how many voice channels do we have?" → {"reply":"There are 3 voice channels: Lounge, Music and Gaming.","actions":[]}',
].join(" ");

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

  const context = await serverContext(guild);
  const raw = await askJson<unknown>(SYSTEM, `Staff member: ${member.displayName} (id ${member.id}).\nInstruction: ${instruction.slice(0, 1500)}\n\nServer context:\n${context}`, PLAN_SCHEMA, 2000);
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
