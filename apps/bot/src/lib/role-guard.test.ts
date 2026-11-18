import { describe, expect, it } from "vitest";
import { QuarantineGuardError, asQuarantine, installRoleGuard, isQuarantined, markQuarantined, quarantineRoleOf, roleIdsOf, setQuarantineRole } from "./role-guard.js";

/** a stand-in for discord.js's role manager: each method records its call */
function manager() {
  const calls: string[] = [];
  const proto = {
    add: async (roles: unknown) => void calls.push(`add ${roleIdsOf(roles).join(",")}`),
    remove: async (roles: unknown) => void calls.push(`remove ${roleIdsOf(roles).join(",")}`),
    set: async (roles: unknown) => void calls.push(`set ${roleIdsOf(roles).join(",")}`),
  };
  installRoleGuard(proto);
  installRoleGuard(proto); // a second install must not wrap twice
  const on = (guildId: string, memberId: string) => ({ guild: { id: guildId }, member: { id: memberId } });
  return { proto, calls, on };
}

describe("roleIdsOf", () => {
  it("reads an id, a role, a list and a collection keyed by id", () => {
    expect(roleIdsOf("5")).toEqual(["5"]);
    expect(roleIdsOf({ id: "6", name: "x" })).toEqual(["6"]);
    expect(roleIdsOf(["5", { id: "6" }])).toEqual(["5", "6"]);
    expect(roleIdsOf(new Map([["7", { id: "7" }]]))).toEqual(["7"]);
    expect(roleIdsOf(null)).toEqual([]);
  });
});

describe("the role gate", () => {
  it("lets ordinary role changes through in a server without quarantine", async () => {
    const { proto, calls, on } = manager();
    await proto.add.call(on("g-none", "m"), "2");
    await proto.remove.call(on("g-none", "m"), ["2"]);
    expect(calls).toEqual(["add 2", "remove 2"]);
  });

  it("keeps the quarantine role to the quarantine code", async () => {
    const { proto, calls, on } = manager();
    setQuarantineRole("g1", "9");
    expect(quarantineRoleOf("g1")).toBe("9");
    await expect(proto.add.call(on("g1", "m"), ["2", "9"])).rejects.toBeInstanceOf(QuarantineGuardError);
    await expect(proto.remove.call(on("g1", "m"), "9")).rejects.toThrow(/only with \/quarantine release/);
    expect(calls).toEqual([]);
    await asQuarantine(() => proto.set.call(on("g1", "m"), ["9"]));
    expect(calls).toEqual(["set 9"]);
    setQuarantineRole("g1", null);
  });

  it("judges a change once, though discord.js makes a list change through set", async () => {
    const calls: string[] = [];
    const proto = {
      // as discord.js does for a list: add and remove work out the new set and call set
      async add(this: { guild: { id: string }; member: { id: string } }, roles: unknown) {
        await proto.set.call(this, ["1", ...roleIdsOf(roles)]);
      },
      async remove(this: { guild: { id: string }; member: { id: string } }, roles: unknown) {
        void roles;
        await proto.set.call(this, ["9"]);
      },
      async set(roles: unknown) {
        calls.push(`set ${roleIdsOf(roles).join(",")}`);
      },
    };
    installRoleGuard(proto);
    const member = { guild: { id: "g3" }, member: { id: "m" } };
    setQuarantineRole("g3", "9");
    await proto.add.call(member, ["2"]);
    markQuarantined("g3", "m", true);
    // taking another role from a quarantined member is allowed, also as a list
    await proto.remove.call(member, ["2"]);
    await expect(proto.add.call(member, ["2"])).rejects.toThrow(/is quarantined/);
    expect(calls).toEqual(["set 1,2", "set 9"]);
    markQuarantined("g3", "m", false);
    setQuarantineRole("g3", null);
  });

  it("gives a quarantined member nothing until released, whichever feature asks", async () => {
    const { proto, calls, on } = manager();
    setQuarantineRole("g2", "9");
    markQuarantined("g2", "m", true);
    expect(isQuarantined("g2", "m")).toBe(true);
    await expect(proto.add.call(on("g2", "m"), "2")).rejects.toThrow(/is quarantined/);
    await proto.add.call(on("g2", "someone-else"), "2");
    await proto.add.call(on("g-other", "m"), "2");
    markQuarantined("g2", "m", false);
    await proto.add.call(on("g2", "m"), "2");
    expect(calls).toEqual(["add 2", "add 2", "add 2"]);
    setQuarantineRole("g2", null);
  });
});
