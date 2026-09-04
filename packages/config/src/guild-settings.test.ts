import { describe, expect, it } from "vitest";
import { parseGuildSettings } from "./guild-settings.js";

describe("parseGuildSettings", () => {
  it("fills defaults when empty", () => {
    const settings = parseGuildSettings({});
    expect(settings.locale).toBe("en");
    expect(settings.embedColor).toBe("#E8FF47");
    expect(settings.logChannelId).toBeNull();
    expect(settings.moduleFlags.core).toBe(true);
    expect(settings.moduleFlags.moderation).toBe(true);
    expect(settings.moduleFlags.community).toBe(true);
    expect(settings.moduleFlags.levels).toBe(true);
    expect(settings.features.levelsEnabled).toBe(true);
    expect(settings.features.commandPrefix).toBe("?");
    expect(settings.community.welcomeEnabled).toBe(false);
    expect(settings.community.invitesEnabled).toBe(false);
  });

  it("accepts a valid embed color", () => {
    const settings = parseGuildSettings({ embedColor: "#112233" });
    expect(settings.embedColor).toBe("#112233");
  });

  it("rejects an invalid embed color", () => {
    expect(() => parseGuildSettings({ embedColor: "green" })).toThrow();
  });
});
