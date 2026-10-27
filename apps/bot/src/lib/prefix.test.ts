import { describe, expect, it } from "vitest";
import { matchPrefix, parsePrefixArgs, tokenize } from "./prefix.js";

describe("matchPrefix", () => {
  it("strips z!", () => {
    expect(matchPrefix("z!play never", "z!", [])).toEqual({ rest: "play never" });
  });

  it("always accepts ?", () => {
    expect(matchPrefix("?play kalyani", "z!", [])).toEqual({ rest: "play kalyani" });
    expect(matchPrefix("?play kalyani", "?", [])).toEqual({ rest: "play kalyani" });
  });

  it("strips a mention", () => {
    expect(matchPrefix("<@123> ping", "z!", ["123"])).toEqual({ rest: "ping" });
  });

  it("ignores other text", () => {
    expect(matchPrefix("hello", "z!", [])).toBeNull();
  });
});

describe("parsePrefixArgs", () => {
  it("a trailing attachment option doesn't stop the string swallowing the line (?zaru bug)", () => {
    const parsed = parsePrefixArgs(
      [
        { name: "do", type: 3, required: true },
        { name: "file", type: 11, required: false },
      ],
      tokenize("how many members do we have"),
    );
    expect(parsed.values.get("do")).toBe("how many members do we have");
    expect(parsed.missing).toBeNull();
  });

  it("reads named arguments (name:value) and sets only those", () => {
    const opts = [
      {
        name: "config",
        type: 1,
        options: [
          { name: "currency_symbol", type: 3 },
          { name: "chat_money_min", type: 4 },
          { name: "chat_money_max", type: 4 },
          { name: "chat_money_cooldown", type: 4 },
        ],
      },
    ];
    const parsed = parsePrefixArgs(opts, tokenize("config chat_money_min:5 chat_money_max:15 chat_money_cooldown:60"));
    expect(parsed.subcommand).toBe("config");
    expect(parsed.values.get("chat_money_min")).toBe("5");
    expect(parsed.values.get("chat_money_max")).toBe("15");
    expect(parsed.values.get("chat_money_cooldown")).toBe("60");
    expect(parsed.values.get("currency_symbol")).toBeUndefined();
    expect(parsed.missing).toBeNull();
  });

  it("mixes name=value with positional and still fills required options", () => {
    const opts = [
      { name: "bet", type: 4, required: true },
      { name: "side", type: 3, required: true },
    ];
    const parsed = parsePrefixArgs(opts, tokenize("side=heads 100"));
    expect(parsed.values.get("side")).toBe("heads");
    expect(parsed.values.get("bet")).toBe("100");
    expect(parsed.missing).toBeNull();
  });

  it("reports a missing required option (e.g. !cf with no bet)", () => {
    const opts = [
      { name: "bet", type: 4, required: true },
      { name: "side", type: 3, required: true },
    ];
    expect(parsePrefixArgs(opts, tokenize("")).missing).toBe("bet");
  });

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
