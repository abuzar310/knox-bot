import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { hasMinRank } from "@knox/shared";
import { canRunCommand, resolveKnoxRank } from "./resolve.js";
import type { KnoxCommand } from "../types.js";
import { DEFAULT_MODULE_FLAGS } from "@knox/shared";

function fakeMember(opts: {
  id: string;
  ownerId: string;
  roleIds: string[];
  /** holds Discord's Administrator permission */
  administrator?: boolean;
  manageGuild?: boolean;
}) {
  return {
    id: opts.id,
    guild: { ownerId: opts.ownerId },
    roles: { cache: { has: (id: string) => opts.roleIds.includes(id) } },
    permissions: {
      has: (flag: bigint) => {
        if (opts.administrator) return true;
        if (opts.manageGuild && flag === PermissionFlagsBits.ManageGuild) return true;
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

  it("treats Manage Server as at least mod, so staff can moderate without mapped roles", () => {
    const member = fakeMember({ id: "5", ownerId: "1", roleIds: [], manageGuild: true });
    expect(resolveKnoxRank(member, [])).toBe("mod");
  });

  it("keeps everyone else at member when nothing is mapped", () => {
    const member = fakeMember({ id: "4", ownerId: "1", roleIds: ["r-random"] });
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

  it("uses rank ladder", () => {
    expect(hasMinRank("admin", "mod")).toBe(true);
  });
});
