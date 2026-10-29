import { describe, expect, it } from "vitest";
import {
  OWNER_ROLE_ID,
  findOwnerRoleId,
  isOwnerRole,
  ownerRolePeerBan,
  parseOwnerModOrder,
  personFromChat,
  wearsOwnerRole,
} from "./owner-mod.js";

const ABUZAR = "959328052519772200";
const SUHAIB = "800265791043534848";
const GUILD_OWNER = ABUZAR;

function member(id: string, roleIds: string[], bot = false) {
  return {
    id,
    user: { bot },
    roles: { cache: { has: (roleId: string) => roleIds.includes(roleId) } },
  };
}

describe("owner role", () => {
  it("recognises the live Owner role and a plain Owner name", () => {
    expect(isOwnerRole({ id: OWNER_ROLE_ID, name: "₪》│Owner" })).toBe(true);
    expect(isOwnerRole({ id: "1", name: "Owner" })).toBe(true);
    expect(isOwnerRole({ id: "1", name: "₪》│Member" })).toBe(false);
    expect(isOwnerRole({ id: "1", name: "co-owner" })).toBe(false);
  });

  it("finds the role id from the list", () => {
    expect(findOwnerRoleId([{ id: "9", name: "Member" }, { id: OWNER_ROLE_ID, name: "₪》│Owner" }])).toBe(OWNER_ROLE_ID);
    expect(findOwnerRoleId([{ id: "9", name: "Member" }])).toBeNull();
  });
});

describe("who may ban an Owner-role member", () => {
  const holder = member("100", [OWNER_ROLE_ID]);

  it("lets Abuzar and Suhaib ban a peer who wears Owner", () => {
    expect(ownerRolePeerBan(ABUZAR, holder, GUILD_OWNER)).toBe(true);
    expect(ownerRolePeerBan(SUHAIB, holder, GUILD_OWNER)).toBe(true);
  });

  it("refuses everyone else, yourself, the server owner, bots, and people without the role", () => {
    expect(ownerRolePeerBan("555", holder, GUILD_OWNER)).toBe(false);
    expect(ownerRolePeerBan(SUHAIB, member(SUHAIB, [OWNER_ROLE_ID]), GUILD_OWNER)).toBe(false);
    expect(ownerRolePeerBan(SUHAIB, member(GUILD_OWNER, [OWNER_ROLE_ID]), GUILD_OWNER)).toBe(false);
    expect(ownerRolePeerBan(SUHAIB, member("100", [OWNER_ROLE_ID], true), GUILD_OWNER)).toBe(false);
    expect(ownerRolePeerBan(SUHAIB, member("100", ["member"]), GUILD_OWNER)).toBe(false);
    expect(wearsOwnerRole(holder)).toBe(true);
    expect(wearsOwnerRole(member("100", ["member"]))).toBe(false);
  });
});

describe("parse a ban or owner-role removal", () => {
  it("reads a name, a mention, or usko", () => {
    expect(parseOwnerModOrder("ban gasolina")).toEqual({ kind: "ban", target: "gasolina", pronoun: false });
    expect(parseOwnerModOrder("suhaib ko ban karo")).toEqual({ kind: "ban", target: "suhaib", pronoun: false });
    expect(parseOwnerModOrder("ban <@1008651022266282004>")).toEqual({ kind: "ban", target: "1008651022266282004", pronoun: false });
    expect(parseOwnerModOrder("usko ban kar do")).toEqual({ kind: "ban", target: "", pronoun: true });
    expect(parseOwnerModOrder("owner role hatao himan se")).toEqual({ kind: "remove_owner_role", target: "himan", pronoun: false });
    expect(parseOwnerModOrder("remove the owner role from gasolinamyans")).toEqual({
      kind: "remove_owner_role",
      target: "gasolinamyans",
      pronoun: false,
    });
    expect(parseOwnerModOrder("@himan_00463 se owner role nikal do")).toEqual({
      kind: "remove_owner_role",
      target: "himan_00463",
      pronoun: false,
    });
  });

  it("leaves questions, refusals, and other jobs alone", () => {
    expect(parseOwnerModOrder("who tried to ban me")).toBeNull();
    expect(parseOwnerModOrder("mat ban karo")).toBeNull();
    expect(parseOwnerModOrder("remove scam posts")).toBeNull();
    expect(parseOwnerModOrder("ban him and remove the owner role")).toBeNull();
    expect(parseOwnerModOrder("remove the member role")).toBeNull();
  });

  it("picks the person named in the last reply", () => {
    const chat = "Abuzar: who tried to ban me\nZARU: Suhaib (suhaibking) ne ban kiya tha.";
    expect(personFromChat(chat, "Abuzar")).toBe("suhaibking");
  });
});
