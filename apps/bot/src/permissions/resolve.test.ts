import { describe, expect, it } from "vitest";
import { hasMinRank } from "@knox/shared";
import { canRunCommand, resolveKnoxRank } from "./resolve.js";
import type { KnoxCommand } from "../types.js";
import { DEFAULT_MODULE_FLAGS } from "@knox/shared";

function fakeMember(opts: {
  id: string;
  ownerId: string;
  roleIds: string[];
}) {
  return {
    id: opts.id,
    guild: { ownerId: opts.ownerId },
    roles: { cache: { has: (id: string) => opts.roleIds.includes(id) } },
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
