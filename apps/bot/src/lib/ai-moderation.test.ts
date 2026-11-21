import { afterEach, describe, expect, it } from "vitest";
import { aiProvider, aiProviderLabel, decideFromScores } from "./ai-moderation.js";

const PROVIDER_ENV = ["AI_PROVIDER", "OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"] as const;

describe("aiProvider", () => {
  const saved = Object.fromEntries(PROVIDER_ENV.map((key) => [key, process.env[key]]));
  afterEach(() => {
    for (const key of PROVIDER_ENV) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses OpenRouter when forced even if a Gemini key is also set", () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    process.env.AI_PROVIDER = "openrouter";
    expect(aiProvider()).toBe("openrouter");
    expect(aiProviderLabel()).toBe("OpenRouter");
  });

  it("falls back to OpenRouter when it is the only key", () => {
    for (const key of PROVIDER_ENV) delete process.env[key];
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    expect(aiProvider()).toBe("openrouter");
  });

  it("does not pick OpenRouter over Gemini unless forced", () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiProvider()).toBe("gemini");
  });
});

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
