// Server audit log: turns each audit-log entry into a readable "who did what" line in the log channel —
// channels, roles, bans, kicks, webhooks and emoji created, deleted or changed, with the person who did it.
// Enabled per guild by features.logServer. Message edits/deletes and joins/leaves are logged elsewhere.
import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from "discord.js";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../client.js";
import { logLine } from "../modules/moderation/lib/modlog.js";
import { streamChannelId } from "./log-target.js";

type Line = { title: string; what: string; color: number };

/** best-effort name of whatever the entry touched */
function targetName(entry: GuildAuditLogsEntry): string {
  const t = entry.target as { name?: string; tag?: string; username?: string } | null;
  if (t?.tag) return t.tag;
  if (t?.name) return `**${t.name}**`;
  if (t?.username) return t.username;
  const nameChange = entry.changes?.find((c) => c.key === "name");
  const n = (nameChange?.new ?? nameChange?.old) as string | undefined;
  if (n) return `**${n}**`;
  return entry.targetId ? `\`${entry.targetId}\`` : "something";
}

const RED = 0xff5c5c;
const GREEN = 0x3ddc84;
const AMBER = 0xf0c24b;

function describe(entry: GuildAuditLogsEntry): Line | null {
  const name = targetName(entry);
  switch (entry.action as AuditLogEvent) {
    case AuditLogEvent.ChannelCreate:
      return { title: "Channel created", what: `${name} was created`, color: GREEN };
    case AuditLogEvent.ChannelDelete:
      return { title: "Channel deleted", what: `${name} was deleted`, color: RED };
    case AuditLogEvent.ChannelUpdate:
      return { title: "Channel changed", what: `${name} was edited`, color: AMBER };
    case AuditLogEvent.RoleCreate:
      return { title: "Role created", what: `role ${name} was created`, color: GREEN };
    case AuditLogEvent.RoleDelete:
      return { title: "Role deleted", what: `role ${name} was deleted`, color: RED };
    case AuditLogEvent.RoleUpdate: {
      const permsChanged = entry.changes?.some((c) => c.key === "permissions");
      return { title: "Role changed", what: `role ${name} was edited${permsChanged ? " (permissions changed)" : ""}`, color: AMBER };
    }
    case AuditLogEvent.MemberBanAdd:
      return { title: "Member banned", what: `${name} was banned`, color: RED };
    case AuditLogEvent.MemberBanRemove:
      return { title: "Member unbanned", what: `${name} was unbanned`, color: GREEN };
    case AuditLogEvent.MemberKick:
      return { title: "Member kicked", what: `${name} was kicked`, color: RED };
    case AuditLogEvent.WebhookCreate:
      return { title: "Webhook created", what: `a webhook ${name} was created`, color: AMBER };
    case AuditLogEvent.WebhookDelete:
      return { title: "Webhook deleted", what: `a webhook was deleted`, color: AMBER };
    case AuditLogEvent.EmojiCreate:
      return { title: "Emoji added", what: `emoji ${name} was added`, color: GREEN };
    case AuditLogEvent.EmojiDelete:
      return { title: "Emoji deleted", what: `an emoji was deleted`, color: AMBER };
    case AuditLogEvent.MemberRoleUpdate: {
      const added = entry.changes?.find((c) => c.key === "$add");
      const removed = entry.changes?.find((c) => c.key === "$remove");
      const roles = [...((added?.new as { name: string }[]) ?? []).map((r) => `+${r.name}`), ...((removed?.new as { name: string }[]) ?? []).map((r) => `-${r.name}`)].join(", ");
      return { title: "Member roles changed", what: `${name}: ${roles || "roles changed"}`, color: AMBER };
    }
    default:
      return null;
  }
}

export async function logServerAction(client: KnoxClient, entry: GuildAuditLogsEntry, guild: Guild, settings: GuildSettings) {
  if (!settings.features.logServer || !streamChannelId(settings, "server")) return;
  // ZARU's own actions are already reported where they happen; don't double-log them
  if (entry.executorId === client.user?.id) return;
  const line = describe(entry);
  if (!line) return;
  const who = entry.executor?.tag ?? (entry.executorId ? `\`${entry.executorId}\`` : "someone");
  const reason = entry.reason ? ` · ${entry.reason.slice(0, 100)}` : "";
  await logLine(guild, settings, line.title, `${line.what} by **${who}**${reason}`, line.color, "server").catch(() => undefined);
}
