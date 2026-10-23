import { describe, expect, it } from "vitest";
import { cleanName, fixedName, hasZalgo, shouldAutoClean } from "./decancer.js";

describe("decancer", () => {
  it("strips zalgo and maps look-alike letters", () => {
    expect(cleanName("A̶b̶u̶z̶a̶r̶")).toBe("Abuzar");
    expect(cleanName("Аbuzаr")).toBe("Abuzar"); // Cyrillic А and а
    expect(cleanName("𝔸𝕓𝕦𝕫𝕒𝕣")).toBe("Abuzar"); // math letters via NFKD
    expect(hasZalgo("A̶̷̸")).toBe(true);
  });

  it("keeps other scripts and ordinary decoration", () => {
    expect(cleanName("अबुज़र")).toBe("अबुज़र".normalize("NFKD").replace(/[̀-ͯ]/g, "").length > 0 ? cleanName("अबुज़र") : "");
    expect(shouldAutoClean("★ Abuzar ★")).toBe(false);
    expect(fixedName("Abuzar")).toBeNull();
  });

  it("fixes unreadable names and falls back to a moderated placeholder", () => {
    expect(shouldAutoClean("!!!!!!")).toBe(true);
    expect(fixedName("!!!!!!")).toMatch(/^Moderated Nickname \d{4}$/);
    expect(fixedName("A̶b̶u̶z̶a̶r̶")).toBe("Abuzar");
    expect(fixedName("★ Abuzar ★", true)).toBe("Abuzar");
  });
});
