import { describe, expect, it } from "vitest";
import { MODULE_IDS } from "@knox/shared";
import { guildSettingsSchema } from "@knox/config";
import { ACTION_TYPES, PERMISSION_FOR, describeAction, isHere, needsConfirmation, sanitizePlan } from "./actions.js";
import { applySetting, applyToggle, toggleState, zaruSummary } from "./settings-map.js";
import { isoWithOffset } from "./run.js";
import { extractInstruction } from "../../modules/admin/events/assistant.js";

describe("assistant plans", () => {
  it("has a permission and a description for every action", () => {
    expect(ACTION_TYPES.length).toBeGreaterThan(50);
    for (const type of ACTION_TYPES) {
      expect(typeof PERMISSION_FOR[type]).toBe("bigint");
      const line = describeAction({ type, args: {} });
      expect(line.length).toBeGreaterThan(3);
      expect(line).not.toContain("undefined");
    }
    expect(needsConfirmation([{ type: "give_role_all", args: { role: "x" } }])).toBe(true);
    expect(needsConfirmation([{ type: "set_server_name", args: { name: "x" } }])).toBe(true);
    expect(needsConfirmation([{ type: "warn", args: { member: "x" } }])).toBe(false);
  });

  it("changes ZARU's own settings by plain names without touching the original", () => {
    const base = guildSettingsSchema.parse({});
    expect(toggleState(base, "ai_moderation")).toBe(false);
    const on = applyToggle(base, "AI moderation", true);
    expect(on?.moderation.aiModeration).toBe(true);
    expect(base.moderation.aiModeration).toBe(false);
    const welcome = applySetting(base, "welcome channel", "123456789012345678");
    expect(welcome?.community.welcomeChannelId).toBe("123456789012345678");
    expect(welcome?.community.welcomeEnabled).toBe(true);
    expect(applySetting(base, "nonsense", "1")).toBeNull();
    const first = MODULE_IDS[0]!;
    expect(applyToggle(base, first, false)?.moduleFlags[first]).toBe(false);
    const summary = zaruSummary(welcome!);
    expect(summary.settings.welcome_channel).toBe("123456789012345678");
    expect(summary.on).toContain("welcome");
  });

  it("writes the local time with its offset", () => {
    expect(isoWithOffset(new Date("2026-10-26T15:30:00Z"))).toMatch(/^2026-10-2[67]T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/);
  });

  it("keeps only known actions and bounds their arguments", () => {
    const plan = sanitizePlan({
      reply: "On it",
      actions: [
        { type: "create_role", args: { name: "  XYZ  ", color: "#ff0000" } },
        { type: "restrict_channel", args: { channel: "123456789012345678", role: "XYZ" } },
        { type: "purge", args: { amount: 500 } },
        { type: "launch_nukes", args: {} },
        { type: "timeout", args: { member: "rahul", minutes: 999999 } },
      ],
    });
    expect(plan.actions.map((a) => a.type)).toEqual(["create_role", "restrict_channel", "purge", "timeout"]);
    expect(plan.actions[0]?.args.name).toBe("XYZ");
    expect(plan.actions[2]?.args.amount).toBe(100);
    expect(plan.actions[3]?.args.minutes).toBe(40_320);
  });

  it("asks for confirmation only for irreversible things", () => {
    expect(needsConfirmation([{ type: "kick", args: { member: "x" } }])).toBe(false);
    expect(needsConfirmation([{ type: "ban", args: { member: "x" } }])).toBe(true);
    expect(needsConfirmation([{ type: "delete_channel", args: { channel: "x" } }])).toBe(true);
    expect(needsConfirmation([{ type: "purge", args: { amount: 20 } }])).toBe(false);
    expect(needsConfirmation([{ type: "purge", args: { amount: 80 } }])).toBe(true);
  });

  it("describes actions for people", () => {
    expect(describeAction({ type: "create_channel", args: { name: "secret", role: "XYZ" } })).toBe("create text channel **secret**, visible only to XYZ");
  });

  it("understands 'here' and names or topics that landed in text", () => {
    const plan = sanitizePlan({
      reply: "",
      actions: [
        { type: "rename_channel", args: { channel: "here", text: "chit-chat" } },
        { type: "set_topic", args: { text: "rules live here" } },
        { type: "set_slowmode", args: { channel: "yahan", seconds: 30 } },
      ],
    });
    expect(plan.actions[0]?.args).toMatchObject({ channel: "here", name: "chit-chat" });
    expect(plan.actions[0]?.args.text).toBeUndefined();
    expect(plan.actions[1]?.args.topic).toBe("rules live here");
    expect(describeAction(plan.actions[0]!)).toBe("rename this channel to **chit-chat**");
    expect(describeAction(plan.actions[2]!)).toBe("slowmode 30s in this channel");
    expect(isHere("Here")).toBe(true);
    expect(isHere("general")).toBe(false);
    expect(isHere(undefined)).toBe(false);
  });

  it("recognises instructions addressed to ZARU", () => {
    expect(extractInstruction("zaru, kick rahul", "1")).toBe("kick rahul");
    expect(extractInstruction("ZARU create a channel called plans", "1")).toBe("create a channel called plans");
    expect(extractInstruction("<@1> lock this channel", "1")).toBe("lock this channel");
    expect(extractInstruction("zarus are cool", "1")).toBeNull();
    expect(extractInstruction("hello everyone", "1")).toBeNull();
  });
});
