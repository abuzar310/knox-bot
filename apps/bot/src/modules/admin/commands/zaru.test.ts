import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { zaruCommand } from "./zaru.js";

describe("/zaru", () => {
  it("is hidden from members and requires an admin", () => {
    const json = zaruCommand.data.toJSON();
    expect(json.default_member_permissions).toBe(PermissionFlagsBits.ManageGuild.toString());
    expect(zaruCommand.requiredRank).toBe("admin");
  });
});
