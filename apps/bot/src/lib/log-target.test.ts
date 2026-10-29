import { describe, expect, it } from "vitest";
import { parseGuildSettings } from "@knox/config";
import { streamChannelId } from "./log-target.js";

describe("streamChannelId", () => {
  it("uses the one log channel when a stream has none of its own", () => {
    const settings = parseGuildSettings({ logChannelId: "111111111111111111" });
    expect(streamChannelId(settings, "messages")).toBe("111111111111111111");
    expect(streamChannelId(settings, "mod")).toBe("111111111111111111");
  });

  it("prefers the stream channel", () => {
    const settings = parseGuildSettings({
      logChannelId: "111111111111111111",
      features: { logVoiceChannelId: "222222222222222222" },
    });
    expect(streamChannelId(settings, "voice")).toBe("222222222222222222");
    expect(streamChannelId(settings, "joins")).toBe("111111111111111111");
  });
});
