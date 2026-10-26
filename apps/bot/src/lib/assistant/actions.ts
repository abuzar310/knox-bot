// The vocabulary the assistant can plan with: every action a staff member might ask for in plain words, the
// Discord permission the asker must hold for it, which ones need a confirm press, and how a plan is checked.
import { PermissionFlagsBits } from "discord.js";

export const ACTION_TYPES = [
  // channels
  "create_channel",
  "create_category",
  "rename_channel",
  "move_channel",
  "delete_channel",
  "clone_channel",
  "set_topic",
  "set_slowmode",
  "set_nsfw",
  "set_user_limit",
  "set_bitrate",
  "set_voice_region",
  "set_channel_position",
  "sync_permissions",
  "lock_channel",
  "unlock_channel",
  "restrict_channel",
  "open_channel",
  "set_permission",
  "gate_server",
  "create_thread",
  // roles
  "create_role",
  "edit_role",
  "delete_role",
  "move_role",
  "give_role",
  "remove_role",
  "give_role_all",
  "remove_role_all",
  // members
  "set_nickname",
  "warn",
  "kick",
  "ban",
  "unban",
  "timeout",
  "untimeout",
  "voice_mute",
  "voice_deafen",
  "voice_disconnect",
  "voice_move",
  "dm_member",
  "give_coins",
  "take_coins",
  "give_xp",
  // messages
  "purge",
  "pin_last",
  "edit_last",
  "react_last",
  "send_message",
  "send_embed",
  "send_poll",
  "create_invite",
  "create_event",
  "schedule_message",
  "remind",
  "start_giveaway",
  "set_sticky",
  "remove_sticky",
  "ticket_panel",
  "create_tag",
  "delete_tag",
  "add_auto_response",
  "remove_auto_response",
  "add_feed",
  "remove_feed",
  // server and ZARU itself
  "set_server_name",
  "set_server_icon",
  "set_server_channel",
  "set_notifications",
  "set_content_filter",
  "set_verification",
  "create_emoji",
  "delete_emoji",
  "lockdown_server",
  "end_lockdown",
  "raid_mode",
  "prune_inactive",
  "block_words",
  "unblock_words",
  "configure",
  "set_feature",
  "set_text",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type ActionArgs = {
  name?: string;
  kind?: string;
  channel?: string;
  category?: string;
  role?: string;
  member?: string;
  other?: string;
  permission?: string;
  reason?: string;
  minutes?: number;
  amount?: number;
  seconds?: number;
  text?: string;
  topic?: string;
  color?: string;
  when?: string;
  url?: string;
  enabled?: boolean;
  hoist?: boolean;
  mentionable?: boolean;
};

export type Action = { type: ActionType; args: ActionArgs };
export type Plan = { reply: string; actions: Action[] };

export const MAX_ACTIONS = 10;

const HERE = /^(here|this|this channel|current channel|yahan|idhar)$/i;
/** the planner writes "here" for the channel the instruction was given in */
export const isHere = (ref?: string) => !!ref && HERE.test(ref.trim());
const chanLabel = (ref?: string) => (!ref || isHere(ref) ? "this channel" : ref);
const NAMED: readonly string[] = ["rename_channel", "set_nickname", "create_channel", "create_role", "create_category", "set_server_name", "clone_channel", "create_emoji", "create_tag"];

const P = PermissionFlagsBits;
/** the Discord permission the person asking must have for each action (Administrator and the owner pass everything) */
export const PERMISSION_FOR: Record<ActionType, bigint> = {
  create_channel: P.ManageChannels,
  create_category: P.ManageChannels,
  rename_channel: P.ManageChannels,
  move_channel: P.ManageChannels,
  delete_channel: P.ManageChannels,
  clone_channel: P.ManageChannels,
  set_topic: P.ManageChannels,
  set_slowmode: P.ManageChannels,
  set_nsfw: P.ManageChannels,
  set_user_limit: P.ManageChannels,
  set_bitrate: P.ManageChannels,
  set_voice_region: P.ManageChannels,
  set_channel_position: P.ManageChannels,
  sync_permissions: P.ManageRoles,
  lock_channel: P.ManageRoles,
  unlock_channel: P.ManageRoles,
  restrict_channel: P.ManageRoles,
  open_channel: P.ManageRoles,
  set_permission: P.ManageRoles,
  gate_server: P.ManageRoles,
  create_thread: P.CreatePublicThreads,
  create_role: P.ManageRoles,
  edit_role: P.ManageRoles,
  delete_role: P.ManageRoles,
  move_role: P.ManageRoles,
  give_role: P.ManageRoles,
  remove_role: P.ManageRoles,
  give_role_all: P.ManageRoles,
  remove_role_all: P.ManageRoles,
  set_nickname: P.ManageNicknames,
  warn: P.ModerateMembers,
  kick: P.KickMembers,
  ban: P.BanMembers,
  unban: P.BanMembers,
  timeout: P.ModerateMembers,
  untimeout: P.ModerateMembers,
  voice_mute: P.MuteMembers,
  voice_deafen: P.DeafenMembers,
  voice_disconnect: P.MoveMembers,
  voice_move: P.MoveMembers,
  dm_member: P.ModerateMembers,
  give_coins: P.ManageGuild,
  take_coins: P.ManageGuild,
  give_xp: P.ManageGuild,
  purge: P.ManageMessages,
  pin_last: P.ManageMessages,
  edit_last: P.ManageMessages,
  react_last: P.AddReactions,
  send_message: P.SendMessages,
  send_embed: P.SendMessages,
  send_poll: P.SendPolls,
  create_invite: P.CreateInstantInvite,
  create_event: P.ManageEvents,
  schedule_message: P.ManageGuild,
  remind: P.SendMessages,
  start_giveaway: P.ManageMessages,
  set_sticky: P.ManageMessages,
  remove_sticky: P.ManageMessages,
  ticket_panel: P.ManageGuild,
  create_tag: P.ManageMessages,
  delete_tag: P.ManageMessages,
  add_auto_response: P.ManageGuild,
  remove_auto_response: P.ManageGuild,
  add_feed: P.ManageGuild,
  remove_feed: P.ManageGuild,
  set_server_name: P.ManageGuild,
  set_server_icon: P.ManageGuild,
  set_server_channel: P.ManageGuild,
  set_notifications: P.ManageGuild,
  set_content_filter: P.ManageGuild,
  set_verification: P.ManageGuild,
  create_emoji: P.ManageGuildExpressions,
  delete_emoji: P.ManageGuildExpressions,
  lockdown_server: P.ManageChannels,
  end_lockdown: P.ManageChannels,
  raid_mode: P.ManageGuild,
  prune_inactive: P.KickMembers,
  block_words: P.ManageGuild,
  unblock_words: P.ManageGuild,
  configure: P.ManageGuild,
  set_feature: P.ManageGuild,
  set_text: P.ManageGuild,
};

const CONFIRM: ReadonlySet<ActionType> = new Set<ActionType>(["ban", "delete_channel", "delete_role", "give_role_all", "remove_role_all", "set_server_name", "prune_inactive", "gate_server"]);

/** irreversible or sweeping things get one confirm press first */
export function needsConfirmation(actions: Action[]) {
  return actions.some((a) => CONFIRM.has(a.type) || (a.type === "purge" && (a.args.amount ?? 0) > 50));
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...ACTION_TYPES] },
          args: {
            type: "object",
            properties: {
              name: { type: "string" },
              kind: { type: "string" },
              channel: { type: "string" },
              category: { type: "string" },
              role: { type: "string" },
              member: { type: "string" },
              other: { type: "string" },
              permission: { type: "string" },
              reason: { type: "string" },
              minutes: { type: "integer" },
              amount: { type: "integer" },
              seconds: { type: "integer" },
              text: { type: "string" },
              topic: { type: "string" },
              color: { type: "string" },
              when: { type: "string" },
              url: { type: "string" },
              enabled: { type: "boolean" },
              hoist: { type: "boolean" },
              mentionable: { type: "boolean" },
            },
          },
        },
        required: ["type"],
      },
    },
  },
  required: ["reply", "actions"],
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined) || undefined;
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : typeof v === "string" && /^(true|on|yes)$/i.test(v) ? true : typeof v === "string" && /^(false|off|no)$/i.test(v) ? false : undefined);

/** whatever the model returned → a plan with known action types and bounded arguments */
export function sanitizePlan(raw: unknown): Plan {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { reply?: unknown; actions?: unknown };
  const actions: Action[] = [];
  for (const item of Array.isArray(obj.actions) ? obj.actions : []) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    if (!(ACTION_TYPES as readonly string[]).includes(String(type))) continue;
    const a = ((item as { args?: unknown }).args ?? {}) as Record<string, unknown>;
    const args: ActionArgs = {
      name: str(a.name, 100),
      kind: str(a.kind, 20)?.toLowerCase(),
      channel: str(a.channel, 100),
      category: str(a.category, 100),
      role: str(a.role, 100),
      member: str(a.member, 100),
      other: str(a.other, 100),
      permission: str(a.permission, 40),
      reason: str(a.reason, 300),
      minutes: int(a.minutes, 0, 40_320),
      amount: int(a.amount, 0, 1_000_000),
      seconds: int(a.seconds, 0, 21_600),
      text: str(a.text, 1800),
      topic: str(a.topic, 1024),
      color: str(a.color, 10),
      when: str(a.when, 40),
      url: str(a.url, 500),
      enabled: bool(a.enabled),
      hoist: bool(a.hoist),
      mentionable: bool(a.mentionable),
    };
    // the small model sometimes drops a new name or a topic into `text`
    if (NAMED.includes(type as string) && !args.name && args.text) {
      args.name = args.text.slice(0, 100);
      args.text = undefined;
    }
    if (type === "set_topic" && !args.topic && args.text) {
      args.topic = args.text.slice(0, 1024);
      args.text = undefined;
    }
    if (type === "purge" && args.amount !== undefined) args.amount = Math.min(100, args.amount);
    actions.push({ type: type as ActionType, args });
    if (actions.length >= MAX_ACTIONS) break;
  }
  return { reply: str(obj.reply, 1500) ?? "", actions };
}

const who = (g: ActionArgs) => g.role ?? g.member ?? "?";
const onOff = (v: boolean | undefined, fallback = true) => ((v ?? fallback) ? "on" : "off");
const short = (s: string | undefined, n = 60) => `"${(s ?? "").slice(0, n)}${(s ?? "").length > n ? "…" : ""}"`;

/** one line per action, for the confirm card and the log */
export function describeAction(a: Action): string {
  const g = a.args;
  const where = chanLabel(g.channel);
  switch (a.type) {
    case "create_channel":
      return `create ${g.kind ?? "text"} channel **${g.name ?? "?"}**${g.category ? ` in ${g.category}` : ""}${g.role ? `, visible only to ${g.role}` : ""}`;
    case "create_category":
      return `create category **${g.name ?? "?"}**`;
    case "rename_channel":
      return `rename ${where} to **${g.name ?? "?"}**`;
    case "move_channel":
      return `move ${where} under **${g.category ?? "?"}**`;
    case "delete_channel":
      return `DELETE channel ${g.channel ?? "?"}`;
    case "clone_channel":
      return `clone ${where}${g.name ? ` as **${g.name}**` : ""}`;
    case "set_topic":
      return `set the topic of ${where}`;
    case "set_slowmode":
      return `slowmode ${g.seconds ?? 0}s in ${where}`;
    case "set_nsfw":
      return `age-restricted ${onOff(g.enabled)} for ${where}`;
    case "set_user_limit":
      return `user limit ${g.amount ?? 0} on ${where}`;
    case "set_bitrate":
      return `bitrate ${g.amount ?? 64} kbps on ${where}`;
    case "set_voice_region":
      return `voice region **${g.name ?? "automatic"}** on ${where}`;
    case "set_channel_position":
      return `move ${where} to the ${g.name ?? (g.amount !== undefined ? `position ${g.amount}` : "top")}`;
    case "sync_permissions":
      return `sync the permissions of ${where} with its category`;
    case "lock_channel":
      return `lock ${where}`;
    case "unlock_channel":
      return `unlock ${where}`;
    case "restrict_channel":
      return `make ${where} visible only to ${g.role ?? "?"}`;
    case "open_channel":
      return `make ${where} visible to everyone`;
    case "set_permission":
      return `${g.enabled === undefined ? "reset" : g.enabled ? "allow" : "deny"} **${g.permission ?? "?"}** for ${who(g)} in ${where}`;
    case "gate_server":
      return `HIDE THE WHOLE SERVER from everyone without the ${g.role ?? "?"} role`;
    case "create_thread":
      return `start a thread **${g.name ?? "?"}** in ${where}`;
    case "create_role":
      return `create role **${g.name ?? "?"}**${g.color ? ` (${g.color})` : ""}`;
    case "edit_role":
      return `edit role ${g.role ?? "?"}${g.name ? ` → **${g.name}**` : ""}${g.color ? `, colour ${g.color}` : ""}${g.hoist !== undefined ? `, shown separately ${onOff(g.hoist)}` : ""}${g.mentionable !== undefined ? `, mentionable ${onOff(g.mentionable)}` : ""}`;
    case "delete_role":
      return `DELETE role ${g.role ?? "?"}`;
    case "move_role":
      return `move role ${g.role ?? "?"} ${g.kind === "below" ? "below" : "above"} ${g.other ?? "?"}`;
    case "give_role":
      return `give ${g.role ?? "?"} to ${g.member ?? "?"}`;
    case "remove_role":
      return `take ${g.role ?? "?"} from ${g.member ?? "?"}`;
    case "give_role_all":
      return `give ${g.role ?? "?"} to EVERY member`;
    case "remove_role_all":
      return `take ${g.role ?? "?"} from EVERY member`;
    case "set_nickname":
      return `rename ${g.member ?? "?"} to **${g.name ?? "their username"}**`;
    case "warn":
      return `warn ${g.member ?? "?"}${g.reason ? ` (${g.reason})` : ""}`;
    case "kick":
      return `kick ${g.member ?? "?"}${g.reason ? ` (${g.reason})` : ""}`;
    case "ban":
      return `BAN ${g.member ?? "?"}${g.reason ? ` (${g.reason})` : ""}`;
    case "unban":
      return `unban ${g.member ?? "?"}`;
    case "timeout":
      return `time out ${g.member ?? "?"} for ${g.minutes ?? 10} min${g.reason ? ` (${g.reason})` : ""}`;
    case "untimeout":
      return `remove the timeout from ${g.member ?? "?"}`;
    case "voice_mute":
      return `voice mute ${onOff(g.enabled)} for ${g.member ?? "?"}`;
    case "voice_deafen":
      return `deafen ${onOff(g.enabled)} for ${g.member ?? "?"}`;
    case "voice_disconnect":
      return `disconnect ${g.member ?? "?"} from voice`;
    case "voice_move":
      return `move ${g.member ?? "?"} to voice channel ${g.channel ?? "?"}`;
    case "dm_member":
      return `DM ${g.member ?? "?"}: ${short(g.text)}`;
    case "give_coins":
      return `give ${g.amount ?? 0} coins to ${g.member ?? "?"}`;
    case "take_coins":
      return `take ${g.amount ?? 0} coins from ${g.member ?? "?"}`;
    case "give_xp":
      return `give ${g.amount ?? 0} XP to ${g.member ?? "?"}`;
    case "purge":
      return `delete the last ${g.amount ?? 10} messages${g.member ? ` from ${g.member}` : ""} in ${where}`;
    case "pin_last":
      return `pin the last ${g.amount && g.amount > 1 ? `${g.amount} messages` : "message"} in ${where}`;
    case "edit_last":
      return `edit my last message in ${where}`;
    case "react_last":
      return `react ${g.text ?? "👍"} to the last message in ${where}`;
    case "send_message":
      return `post in ${where}: ${short(g.text)}`;
    case "send_embed":
      return `post an embed${g.name ? ` **${g.name}**` : ""} in ${where}`;
    case "send_poll":
      return `poll in ${where}: ${short(g.name)}`;
    case "create_invite":
      return `create an invite for ${where}${g.minutes ? `, ${g.minutes} min` : ""}${g.amount ? `, ${g.amount} uses` : ""}`;
    case "create_event":
      return `create event **${g.name ?? "?"}** at ${g.when ?? "?"}${g.channel ? ` in ${g.channel}` : ""}`;
    case "schedule_message":
      return `post ${short(g.text)} in ${where} ${g.kind ?? "daily"}${g.when ? ` from ${g.when}` : ""}`;
    case "remind":
      return `remind you ${g.when ? `at ${g.when}` : `in ${g.minutes ?? 30} min`}: ${short(g.text)}`;
    case "start_giveaway":
      return `giveaway in ${where}: ${short(g.text ?? g.name)}, ${g.minutes ?? 60} min, ${g.amount ?? 1} winner${(g.amount ?? 1) === 1 ? "" : "s"}`;
    case "set_sticky":
      return `sticky note in ${where}: ${short(g.text)}`;
    case "remove_sticky":
      return `remove the sticky note from ${where}`;
    case "ticket_panel":
      return `post the ticket panel in ${where}`;
    case "create_tag":
      return `save tag **${g.name ?? "?"}**`;
    case "delete_tag":
      return `delete tag **${g.name ?? "?"}**`;
    case "add_auto_response":
      return `auto-reply to ${short(g.text, 30)} with ${short(g.topic, 40)}`;
    case "remove_auto_response":
      return `remove the auto-reply for ${short(g.text, 30)}`;
    case "add_feed":
      return `follow ${g.kind ?? "youtube"} ${short(g.text ?? g.url, 40)} in ${where}`;
    case "remove_feed":
      return `stop following ${short(g.text, 40)}`;
    case "set_server_name":
      return `RENAME THE SERVER to **${g.name ?? "?"}**`;
    case "set_server_icon":
      return "change the server icon";
    case "set_server_channel":
      return `set the server's **${g.name ?? "?"}** channel to ${where}`;
    case "set_notifications":
      return `default notifications: **${g.name ?? "?"}**`;
    case "set_content_filter":
      return `explicit media filter: **${g.name ?? "?"}**`;
    case "set_verification":
      return `set verification level to **${g.name ?? "?"}**`;
    case "create_emoji":
      return `add emoji **:${g.name ?? "?"}:**`;
    case "delete_emoji":
      return `delete emoji **:${g.name ?? "?"}:**`;
    case "lockdown_server":
      return `LOCK DOWN every public channel${g.reason ? ` (${g.reason})` : ""}`;
    case "end_lockdown":
      return "end the lockdown";
    case "raid_mode":
      return `raid mode ${onOff(g.enabled)}${(g.enabled ?? true) && g.minutes ? ` for ${g.minutes} min` : ""}`;
    case "prune_inactive":
      return `PRUNE members inactive for ${g.amount ?? 30} days with no role`;
    case "block_words":
      return `block the words ${short(g.text, 50)}`;
    case "unblock_words":
      return `unblock the words ${short(g.text, 50)}`;
    case "configure":
      return `set ZARU's **${g.name ?? "?"}** to ${g.enabled === false ? "off" : g.channel ?? g.role ?? g.category ?? "?"}`;
    case "set_feature":
      return `turn **${g.name ?? "?"}** ${onOff(g.enabled)}`;
    case "set_text":
      return `set ZARU's **${g.name ?? "?"}** text`;
    default:
      return a.type;
  }
}
