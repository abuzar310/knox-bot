// The vocabulary the assistant can plan with: every action a staff member might ask for in plain words, the
// Discord permission the asker must hold for it, which ones need a confirm press, and how a plan is checked.
import { PermissionFlagsBits } from "discord.js";

export const ACTION_TYPES = [
  "create_channel",
  "create_category",
  "create_role",
  "restrict_channel",
  "open_channel",
  "rename_channel",
  "move_channel",
  "set_topic",
  "set_slowmode",
  "lock_channel",
  "unlock_channel",
  "delete_channel",
  "give_role",
  "remove_role",
  "delete_role",
  "set_nickname",
  "kick",
  "ban",
  "timeout",
  "untimeout",
  "purge",
  "send_message",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type ActionArgs = {
  name?: string;
  kind?: string;
  channel?: string;
  category?: string;
  role?: string;
  member?: string;
  reason?: string;
  minutes?: number;
  amount?: number;
  text?: string;
  topic?: string;
  color?: string;
  hoist?: boolean;
  mentionable?: boolean;
  seconds?: number;
};

export type Action = { type: ActionType; args: ActionArgs };
export type Plan = { reply: string; actions: Action[] };

export const MAX_ACTIONS = 10;

/** the Discord permission the person asking must have for each action (Administrator and the owner pass everything) */
export const PERMISSION_FOR: Record<ActionType, bigint> = {
  create_channel: PermissionFlagsBits.ManageChannels,
  create_category: PermissionFlagsBits.ManageChannels,
  create_role: PermissionFlagsBits.ManageRoles,
  restrict_channel: PermissionFlagsBits.ManageRoles,
  open_channel: PermissionFlagsBits.ManageRoles,
  rename_channel: PermissionFlagsBits.ManageChannels,
  move_channel: PermissionFlagsBits.ManageChannels,
  set_topic: PermissionFlagsBits.ManageChannels,
  set_slowmode: PermissionFlagsBits.ManageChannels,
  lock_channel: PermissionFlagsBits.ManageRoles,
  unlock_channel: PermissionFlagsBits.ManageRoles,
  delete_channel: PermissionFlagsBits.ManageChannels,
  give_role: PermissionFlagsBits.ManageRoles,
  remove_role: PermissionFlagsBits.ManageRoles,
  delete_role: PermissionFlagsBits.ManageRoles,
  set_nickname: PermissionFlagsBits.ManageNicknames,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  purge: PermissionFlagsBits.ManageMessages,
  send_message: PermissionFlagsBits.SendMessages,
};

/** irreversible things get one confirm press first */
export function needsConfirmation(actions: Action[]) {
  return actions.some((a) => a.type === "ban" || a.type === "delete_channel" || a.type === "delete_role" || (a.type === "purge" && (a.args.amount ?? 0) > 50));
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
              kind: { type: "string", enum: ["text", "voice", "announcement"] },
              channel: { type: "string" },
              category: { type: "string" },
              role: { type: "string" },
              member: { type: "string" },
              reason: { type: "string" },
              minutes: { type: "integer" },
              amount: { type: "integer" },
              text: { type: "string" },
              topic: { type: "string" },
              color: { type: "string" },
              hoist: { type: "boolean" },
              mentionable: { type: "boolean" },
              seconds: { type: "integer" },
            },
            // Gemini fills properties in this order under constrained decoding; it must match the examples in the prompt
            propertyOrdering: ["name", "kind", "category", "channel", "role", "member", "reason", "minutes", "amount", "seconds", "text", "topic", "color", "hoist", "mentionable"],
          },
        },
        required: ["type"],
        propertyOrdering: ["type", "args"],
      },
    },
  },
  required: ["reply", "actions"],
  propertyOrdering: ["reply", "actions"],
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined) || undefined;
const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);

/** whatever the model returned → a plan with known action types and bounded arguments */
export function sanitizePlan(raw: unknown): Plan {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { reply?: unknown; actions?: unknown };
  const actions: Action[] = [];
  for (const item of Array.isArray(obj.actions) ? obj.actions : []) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: unknown }).type;
    if (!(ACTION_TYPES as readonly string[]).includes(String(type))) continue;
    const a = ((item as { args?: unknown }).args ?? {}) as Record<string, unknown>;
    actions.push({
      type: type as ActionType,
      args: {
        name: str(a.name, 100),
        kind: str(a.kind, 20)?.toLowerCase(),
        channel: str(a.channel, 100),
        category: str(a.category, 100),
        role: str(a.role, 100),
        member: str(a.member, 100),
        reason: str(a.reason, 300),
        minutes: int(a.minutes, 1, 40_320),
        amount: int(a.amount, 1, 100),
        text: str(a.text, 1800),
        topic: str(a.topic, 1024),
        color: str(a.color, 10),
        hoist: typeof a.hoist === "boolean" ? a.hoist : undefined,
        mentionable: typeof a.mentionable === "boolean" ? a.mentionable : undefined,
        seconds: int(a.seconds, 0, 21_600),
      },
    });
    if (actions.length >= MAX_ACTIONS) break;
  }
  return { reply: str(obj.reply, 1500) ?? "", actions };
}

/** one line per action, for the confirm card and the log */
export function describeAction(a: Action): string {
  const g = a.args;
  switch (a.type) {
    case "create_channel":
      return `create ${g.kind ?? "text"} channel **${g.name ?? "?"}**${g.category ? ` in ${g.category}` : ""}${g.role ? `, visible only to ${g.role}` : ""}`;
    case "create_category":
      return `create category **${g.name ?? "?"}**`;
    case "create_role":
      return `create role **${g.name ?? "?"}**${g.color ? ` (${g.color})` : ""}`;
    case "restrict_channel":
      return `make ${g.channel ?? "?"} visible only to ${g.role ?? "?"}`;
    case "open_channel":
      return `make ${g.channel ?? "?"} visible to everyone`;
    case "rename_channel":
      return `rename ${g.channel ?? "?"} to **${g.name ?? "?"}**`;
    case "move_channel":
      return `move ${g.channel ?? "?"} under **${g.category ?? "?"}**`;
    case "set_topic":
      return `set the topic of ${g.channel ?? "?"}`;
    case "set_slowmode":
      return `slowmode ${g.seconds ?? 0}s in ${g.channel ?? "?"}`;
    case "lock_channel":
      return `lock ${g.channel ?? "?"}`;
    case "unlock_channel":
      return `unlock ${g.channel ?? "?"}`;
    case "delete_channel":
      return `DELETE channel ${g.channel ?? "?"}`;
    case "give_role":
      return `give ${g.role ?? "?"} to ${g.member ?? "?"}`;
    case "remove_role":
      return `take ${g.role ?? "?"} from ${g.member ?? "?"}`;
    case "delete_role":
      return `DELETE role ${g.role ?? "?"}`;
    case "set_nickname":
      return `rename ${g.member ?? "?"} to **${g.name ?? "?"}**`;
    case "kick":
      return `kick ${g.member ?? "?"}${g.reason ? ` (${g.reason})` : ""}`;
    case "ban":
      return `BAN ${g.member ?? "?"}${g.reason ? ` (${g.reason})` : ""}`;
    case "timeout":
      return `time out ${g.member ?? "?"} for ${g.minutes ?? 10} min${g.reason ? ` (${g.reason})` : ""}`;
    case "untimeout":
      return `remove the timeout from ${g.member ?? "?"}`;
    case "purge":
      return `delete the last ${g.amount ?? 10} messages${g.channel ? ` in ${g.channel}` : ""}`;
    case "send_message":
      return `post in ${g.channel ?? "?"}: "${(g.text ?? "").slice(0, 60)}${(g.text ?? "").length > 60 ? "…" : ""}"`;
    default:
      return a.type;
  }
}
