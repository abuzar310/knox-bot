import { describe, expect, it } from "vitest";
import { extractHosts, findPhishingHost, isListedHost, lookalikeReason } from "./phish-list.js";

const list = new Set(["scam-nitro.gift", "steamcommunlty.ru"]);

describe("phishing detection", () => {
  it("pulls hosts out of links and bare domains, once each", () => {
    expect(extractHosts("free nitro at https://scam-nitro.gift/claim and SCAM-NITRO.GIFT again, see www.example.com!")).toEqual([
      { host: "scam-nitro.gift", explicit: true },
      { host: "example.com", explicit: false },
    ]);
  });

  it("matches listed domains and their subdomains however they were typed", () => {
    expect(isListedHost("promo.scam-nitro.gift", list)).toBe(true);
    expect(isListedHost("notscam-nitro.gift", list)).toBe(false);
    expect(findPhishingHost("grab it: scam-nitro.gift", list)).toEqual({ host: "scam-nitro.gift", reason: "listed" });
  });

  it("spots look-alike brands but leaves the real sites alone", () => {
    expect(lookalikeReason("dlscord-gifts.com")).toBe("looks like Discord");
    expect(lookalikeReason("free-n1tro.xyz")).toBe("fake Nitro offer");
    expect(lookalikeReason("steamcommunlty.ru")).toBe("looks like Steam");
    expect(lookalikeReason("discord.gg")).toBeNull();
    expect(lookalikeReason("cdn.discordapp.com")).toBeNull();
    expect(lookalikeReason("steamcommunity.com")).toBeNull();
    expect(lookalikeReason("nitrome.com")).toBeNull();
  });

  it("applies look-alike rules to real links only", () => {
    expect(findPhishingHost("claim here https://dlscord-gifts.com/nitro", new Set())).toEqual({ host: "dlscord-gifts.com", reason: "lookalike" });
    expect(findPhishingHost("I saved it as discord.txt and dlscord.com is a typo", new Set())).toBeNull();
    expect(findPhishingHost("join https://discord.gg/abc and https://steamcommunity.com/id/x", new Set())).toBeNull();
  });
});
