import { describe, expect, it } from "vitest";
import { memberOrdinal } from "./cards.js";

describe("member ordinal", () => {
  it("matches the Welcomer style count", () => {
    expect(memberOrdinal(1)).toBe("1st");
    expect(memberOrdinal(2)).toBe("2nd");
    expect(memberOrdinal(3)).toBe("3rd");
    expect(memberOrdinal(11)).toBe("11th");
    expect(memberOrdinal(42)).toBe("42nd");
  });
});
