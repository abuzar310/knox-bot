import { describe, expect, it } from "vitest";
import {
  blueprintFromDiscordTemplate,
  parseTemplateCode,
} from "./server-blueprint.js";
import { ChannelType } from "discord.js";

describe("parseTemplateCode", () => {
  it("accepts a raw code", () => {
    expect(parseTemplateCode("2TffvPuc3aNCad")).toBe("2TffvPuc3aNCad");
  });

  it("accepts discord.new links", () => {
    expect(parseTemplateCode("https://discord.new/2TffvPuc3aNCad")).toBe("2TffvPuc3aNCad");
  });

  it("accepts discord.com/template links", () => {
    expect(parseTemplateCode("https://discord.com/template/abc123XYZ")).toBe("abc123XYZ");
  });

  it("rejects junk", () => {
    expect(parseTemplateCode("not a code!")).toBeNull();
  });
});

describe("blueprintFromDiscordTemplate", () => {
  it("skips @everyone and maps channels under categories", () => {
    const blueprint = blueprintFromDiscordTemplate("abc", "Demo", "desc", {
      roles: [
        { id: 0, name: "@everyone" },
        { id: 1, name: "Gamer", color: 0xe8ff47 },
      ],
      channels: [
        { id: 10, name: "INFO", type: ChannelType.GuildCategory },
        { id: 11, name: "general", type: ChannelType.GuildText, parent_id: 10 },
      ],
    });
    expect(blueprint.roles.map((r) => r.name)).toEqual(["Gamer"]);
    expect(blueprint.channels).toHaveLength(2);
    expect(blueprint.channels[1]?.parentPlaceholderId).toBe("10");
  });
});
