// The decision part of the join gate, kept free of Discord objects so it can be tested on its own.
import type { ModerationConfig } from "@knox/config";

export type JoinVerdict = { reason: "lockdown" | "age" | "avatar"; detail: string } | null;

export type JoinFacts = {
  createdTimestamp: number;
  hasAvatar: boolean;
  /** joins seen in this server over the last minute, this one included */
  joinsLastMinute: number;
  now?: number;
};

type GateSettings = Pick<ModerationConfig, "raidMode" | "joinGateMinAccountAgeHours" | "joinGateRequireAvatar" | "raidJoinsPerMinute">;

export function formatAge(ms: number) {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

/** why a joining member is turned away, or null to let them in */
export function joinVerdict(mod: GateSettings, facts: JoinFacts): JoinVerdict {
  const now = facts.now ?? Date.now();
  if (mod.raidMode) return { reason: "lockdown", detail: "raid mode is on" };
  if (mod.raidJoinsPerMinute > 0 && facts.joinsLastMinute >= mod.raidJoinsPerMinute) {
    return { reason: "lockdown", detail: `${facts.joinsLastMinute} joins in a minute` };
  }
  const age = now - facts.createdTimestamp;
  if (mod.joinGateMinAccountAgeHours > 0 && age < mod.joinGateMinAccountAgeHours * 3_600_000) {
    return { reason: "age", detail: `account is ${formatAge(age)} old, minimum ${mod.joinGateMinAccountAgeHours} h` };
  }
  if (mod.joinGateRequireAvatar && !facts.hasAvatar) return { reason: "avatar", detail: "no profile picture" };
  return null;
}

/** the DM a turned-away member gets, so they know it isn't personal and what to do */
export function joinGateMessage(serverName: string, verdict: NonNullable<JoinVerdict>, minHours: number) {
  switch (verdict.reason) {
    case "lockdown":
      return `**${serverName}** is in lockdown against a raid right now. Please try again later.`;
    case "age":
      return `**${serverName}** only lets in Discord accounts older than ${minHours} hours, and yours is too new. Please try again later.`;
    case "avatar":
      return `**${serverName}** asks members to set a profile picture before joining. Add one and try again.`;
    default:
      return `**${serverName}** turned you away for now. Please try again later.`;
  }
}
