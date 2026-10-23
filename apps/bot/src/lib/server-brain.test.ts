import { describe, expect, it } from "vitest";
import { classifyChannelName, heuristicAnalysis } from "./server-brain.js";
import { snowflakeAgeDays, type ServerSnapshot } from "./server-scan.js";

describe("server brain rules", () => {
  it("guesses purposes from names and kinds", () => {
    expect(classifyChannelName("welcome", "text")).toBe("welcome");
    expect(classifyChannelName("server-rules", "text")).toBe("rules");
    expect(classifyChannelName("patch-notes", "announcement")).toBe("announcements");
    expect(classifyChannelName("mod-log", "text")).toBe("logs");
    expect(classifyChannelName("memes", "text")).toBe("media");
    expect(classifyChannelName("Lounge", "voice")).toBe("voice");
    expect(classifyChannelName("random-stuff", "text")).toBe("other");
    // fancy-font and decorated names common on Indian servers
    expect(classifyChannelName("—͟͞͞⌬』│𝚆𝚎𝚕𝚌𝚘𝚖𝚎", "text")).toBe("welcome");
    expect(classifyChannelName("🎄〣𝙰𝚗𝚗𝚘𝚞𝚗𝚌𝚖𝚎𝚗𝚝", "text")).toBe("announcements");
  });

  it("treats hidden unnamed channels as staff space and finds staff roles", () => {
    const snapshot: ServerSnapshot = {
      guildId: "g",
      name: "Test",
      memberCount: 10,
      createdDaysAgo: 100,
      boosts: 0,
      systemChannelId: null,
      rulesChannelId: null,
      publicUpdatesChannelId: null,
      afkChannelId: null,
      categories: [],
      channels: [
        { id: "1", name: "backroom", kind: "text", parentId: null, parentName: null, topic: null, position: 0, nsfw: false, everyoneCanView: false, everyoneCanSend: false, lastActivityDays: 2 },
        { id: "2", name: "chat", kind: "text", parentId: null, parentName: null, topic: null, position: 1, nsfw: false, everyoneCanView: true, everyoneCanSend: true, lastActivityDays: 0 },
      ],
      roles: [
        { id: "r1", name: "Mod", members: 2, position: 5, hoist: true, managed: false, admin: false, manageGuild: false, manageMessages: true, kickOrBan: true },
        { id: "r2", name: "Member", members: 8, position: 1, hoist: false, managed: false, admin: false, manageGuild: false, manageMessages: false, kickOrBan: false },
      ],
      bots: [],
      automodRules: [],
      features: [],
    };
    const analysis = heuristicAnalysis(snapshot);
    expect(analysis.purposes["1"]).toBe("staff");
    expect(analysis.purposes["2"]).toBe("general");
    expect(analysis.staffRoleIds).toEqual(["r1"]);
  });

  it("reads ages out of snowflakes", () => {
    // a realistic id: Discord epoch + ~31 years + 1 day, so it has the 19 digits real snowflakes have
    const offset = 1_000_000_000_000 + 86_400_000;
    const id = String(BigInt(offset) << 22n);
    expect(snowflakeAgeDays(id, 1420070400000 + offset + 2 * 86_400_000)).toBe(2);
    expect(snowflakeAgeDays("nope")).toBeNull();
  });
});
