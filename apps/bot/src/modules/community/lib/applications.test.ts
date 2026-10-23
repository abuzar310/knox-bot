import { describe, expect, it } from "vitest";
import { appId, parseAppId } from "./applications.js";

describe("application custom ids", () => {
  it("round-trips every action", () => {
    expect(parseAppId(appId.start(7))).toEqual({ action: "start", id: 7 });
    expect(parseAppId(appId.modal(12))).toEqual({ action: "modal", id: 12 });
    expect(parseAppId(appId.accept(3))).toEqual({ action: "accept", id: 3 });
    expect(parseAppId(appId.deny(4))).toEqual({ action: "deny", id: 4 });
    expect(parseAppId(appId.denyModal(5))).toEqual({ action: "denymodal", id: 5 });
  });
  it("rejects other ids and bad numbers", () => {
    expect(parseAppId("knox:ticket:open")).toBeNull();
    expect(parseAppId("knox:app:accept:zero")).toBeNull();
    expect(parseAppId("knox:app:accept:0")).toBeNull();
  });
});
