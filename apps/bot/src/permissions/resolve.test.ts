import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { hasMinRank } from "@knox/shared";
import { canRunCommand, describeAsker, guessRankFromRoleName, resolveKnoxRank } from "./resolve.js";
import type { KnoxCommand } from "../types.js";
import { DEFAULT_MODULE_FLAGS } from "@knox/shared";

function fakeMember(opts: {
  id: string;
  ownerId: string;
  roleIds: string[];
  administrator?: boolean;
  manageGuild?: boolean;
  kick?: boolean;
  moderate?: boolean;
  manageMessages?: boolean;
  roles?: { id: string; name: string; managed?: boolean; position?: number }[];
}) {
  const listed = opts.roles ?? [];
  const ids = new Set([...opts.roleIds, ...listed.map((r) => r.id)]);
  const named = new Map(
    listed.map((r) => [r.id, { id: r.id, name: r.name, managed: r.managed ?? false, position: r.position ?? 1 }]),
  );
  return {
    id: opts.id,
    guild: { ownerId: opts.ownerId, id: "g1" },
    roles: {
      cache: {
        has: (id: string) => ids.has(id),
        values: () => named.values(),
      },
    },
    permissions: {
      has: (flag: bigint) => {
        if (opts.administrator) return true;
        if (opts.manageGuild && flag === PermissionFlagsBits.ManageGuild) return true;
        if (opts.kick && flag === PermissionFlagsBits.KickMembers) return true;
        if (opts.moderate && flag === PermissionFlagsBits.ModerateMembers) return true;
        if (opts.manageMessages && flag === PermissionFlagsBits.ManageMessages) return true;
        return false;
      },
    },
  } as unknown as import("discord.js").GuildMember;
}

const baseCommand: KnoxCommand = {
  moduleId: "core",
  data: { name: "ping" } as KnoxCommand["data"],
  execute: async () => undefined,
  requiredRank: "mod",
  guildOnly: true,
};

describe("guessRankFromRoleName", () => {
  it("reads common staff and DJ role names", () => {
    expect(guessRankFromRoleName("Moderator")).toBe("mod");
    expect(guessRankFromRoleName("Mods")).toBe("mod");
    expect(guessRankFromRoleName("Trial Mod")).toBe("mod");
    expect(guessRankFromRoleName("Staff")).toBe("mod");
    expect(guessRankFromRoleName("Admin")).toBe("admin");
    expect(guessRankFromRoleName("Administrator")).toBe("admin");
    expect(guessRankFromRoleName("Head Staff")).toBe("admin");
    expect(guessRankFromRoleName("DJ")).toBe("dj");
    expect(guessRankFromRoleName("VIP")).toBeNull();
    expect(guessRankFromRoleName("Member")).toBeNull();
    expect(guessRankFromRoleName("Gamer")).toBeNull();
  });
});

describe("resolveKnoxRank", () => {
  it("returns owner for guild owner", () => {
    const member = fakeMember({ id: "1", ownerId: "1", roleIds: [] });
    expect(resolveKnoxRank(member, [])).toBe("owner");
  });

  it("picks highest mapped role rank", () => {
    const member = fakeMember({
      id: "2",
      ownerId: "1",
      roleIds: ["r-mod", "r-admin"],
    });
    expect(
      resolveKnoxRank(member, [
        { rank: "mod", roleId: "r-mod" },
        { rank: "admin", roleId: "r-admin" },
      ]),
    ).toBe("admin");
  });

  it("treats a Discord administrator as at least admin, with no role mapped", () => {
    const member = fakeMember({ id: "3", ownerId: "1", roleIds: [], administrator: true });
    expect(resolveKnoxRank(member, [])).toBe("admin");
  });

  it("treats Manage Server as admin", () => {
    const member = fakeMember({ id: "5", ownerId: "1", roleIds: [], manageGuild: true });
    expect(resolveKnoxRank(member, [])).toBe("admin");
  });

  it("treats Kick / timeout / Manage Messages as mod", () => {
    expect(resolveKnoxRank(fakeMember({ id: "6", ownerId: "1", roleIds: [], kick: true }), [])).toBe("mod");
    expect(resolveKnoxRank(fakeMember({ id: "7", ownerId: "1", roleIds: [], moderate: true }), [])).toBe("mod");
    expect(resolveKnoxRank(fakeMember({ id: "8", ownerId: "1", roleIds: [], manageMessages: true }), [])).toBe("mod");
  });

  it("treats a Discord role named Moderator as mod without a mapping", () => {
    const member = fakeMember({
      id: "9",
      ownerId: "1",
      roleIds: ["r-mod"],
      roles: [{ id: "r-mod", name: "Moderator", position: 5 }],
    });
    expect(resolveKnoxRank(member, [])).toBe("mod");
    const snap = describeAsker(member, "mod");
    expect(snap.roles).toContain("Moderator");
    expect(snap.powers).toMatch(/lock/i);
  });

  it("stops guessing names once an admin or mod role is saved", () => {
    const member = fakeMember({
      id: "10",
      ownerId: "1",
      roleIds: ["r-staff"],
      roles: [{ id: "r-staff", name: "Staff", position: 4 }],
      manageMessages: true,
    });
    expect(resolveKnoxRank(member, [])).toBe("mod");
    expect(resolveKnoxRank(member, [{ rank: "mod", roleId: "r-real-mod" }])).toBe("member");
  });

  it("keeps everyone else at member when nothing is mapped", () => {
    const member = fakeMember({
      id: "4",
      ownerId: "1",
      roleIds: ["r-random"],
      roles: [{ id: "r-random", name: "Gamer" }],
    });
    expect(resolveKnoxRank(member, [{ rank: "mod", roleId: "r-mod" }])).toBe("member");
  });
});

describe("canRunCommand", () => {
  it("denies disabled modules", () => {
    const member = fakeMember({ id: "2", ownerId: "1", roleIds: [] });
    const result = canRunCommand({
      member,
      command: { ...baseCommand, moduleId: "moderation", requiredRank: "member" },
      settings: {
        locale: "en",
        embedColor: "#E8FF47",
        logChannelId: null,
        moduleFlags: { ...DEFAULT_MODULE_FLAGS, moderation: false },
      },
      permissionRows: [],
      overrides: [],
    });
    expect(result.ok).toBe(false);
  });

  it("allows override allow", () => {
    const member = fakeMember({ id: "2", ownerId: "1", roleIds: [] });
    const result = canRunCommand({
      member,
      command: baseCommand,
      settings: {
        locale: "en",
        embedColor: "#E8FF47",
        logChannelId: null,
        moduleFlags: { ...DEFAULT_MODULE_FLAGS },
      },
      permissionRows: [],
      overrides: [
        {
          commandName: "ping",
          allowType: "user",
          allowId: "2",
          effect: "allow",
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("lets the server owner through a deny on a role they wear", () => {
    const member = fakeMember({ id: "1", ownerId: "1", roleIds: ["r-mod"] });
    const result = canRunCommand({
      member,
      command: baseCommand,
      settings: {
        locale: "en",
        embedColor: "#E8FF47",
        logChannelId: null,
        moduleFlags: { ...DEFAULT_MODULE_FLAGS },
      },
      permissionRows: [],
      overrides: [{ commandName: "ping", allowType: "role", allowId: "r-mod", effect: "deny" }],
    });
    expect(result.ok).toBe(true);
  });

  it("uses rank ladder", () => {
    expect(hasMinRank("admin", "mod")).toBe(true);
  });
});
