import { describe, expect, it } from "vitest";
import { matchPrefix, parsePrefixArgs, tokenize } from "./prefix.js";

describe("matchPrefix", () => {
  it("strips z!", () => {
    expect(matchPrefix("z!play never", "z!", [])).toEqual({ rest: "play never" });
  });

  it("strips a mention", () => {
    expect(matchPrefix("<@123> ping", "z!", ["123"])).toEqual({ rest: "ping" });
  });

  it("ignores other text", () => {
    expect(matchPrefix("hello", "z!", [])).toBeNull();
  });
});

describe("parsePrefixArgs", () => {
  it("takes the rest as the last string option", () => {
    const parsed = parsePrefixArgs(
      [{ name: "query", type: 3, required: true }],
      tokenize("never gonna give you up"),
    );
    expect(parsed.values.get("query")).toBe("never gonna give you up");
    expect(parsed.missing).toBeNull();
  });

  it("reads a user mention then the reason", () => {
    const parsed = parsePrefixArgs(
      [
        { name: "user", type: 6, required: true },
        { name: "reason", type: 3, required: false },
      ],
      tokenize("<@99> being loud"),
    );
    expect(parsed.values.get("user")).toBe("99");
    expect(parsed.values.get("reason")).toBe("being loud");
  });

  it("reads a subcommand", () => {
    const parsed = parsePrefixArgs(
      [
        {
          name: "start",
          type: 1,
          options: [{ name: "welcome", type: 7, required: false }],
        },
      ],
      tokenize("start"),
    );
    expect(parsed.subcommand).toBe("start");
  });

  it("reads an integer", () => {
    const parsed = parsePrefixArgs(
      [{ name: "percent", type: 4, required: true }],
      tokenize("80"),
    );
    expect(parsed.values.get("percent")).toBe("80");
  });
});
