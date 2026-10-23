import { describe, expect, it } from "vitest";
import { decideFromScores } from "./ai-moderation.js";

describe("decideFromScores", () => {
  it("removes severe categories whatever the score", () => {
    expect(decideFromScores({ "harassment/threatening": true }, { "harassment/threatening": 0.4 })).toMatchObject({ action: "remove", category: "harassment/threatening" });
    expect(decideFromScores({ "sexual/minors": true }, {})).toMatchObject({ action: "remove" });
  });
  it("removes strong categories only when the model is very sure", () => {
    expect(decideFromScores({ hate: true }, { hate: 0.9 })).toMatchObject({ action: "remove", category: "hate" });
    expect(decideFromScores({ hate: true }, { hate: 0.6 })).toMatchObject({ action: "flag", category: "hate" });
  });
  it("allows ordinary chat", () => {
    expect(decideFromScores({ harassment: false, hate: false }, { harassment: 0.02, hate: 0.01 })).toMatchObject({ action: "allow" });
  });
});
