import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template.js";

describe("renderTemplate", () => {
  it("fills welcome placeholders", () => {
    const out = renderTemplate(
      "Welcome {user} to {server} via {inviter} ({invites})",
      {
        user: "<@1>",
        username: "knox",
        server: "Knox",
        membercount: "12",
        inviter: "<@2>",
        invites: "4",
      },
    );
    expect(out).toBe("Welcome <@1> to Knox via <@2> (4)");
  });
});
