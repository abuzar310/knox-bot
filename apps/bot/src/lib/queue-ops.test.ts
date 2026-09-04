import { describe, expect, it } from "vitest";
import { moveQueueItem, stripQueueDupes } from "./queue-ops.js";

describe("moveQueueItem", () => {
  it("moves an item to a new index", () => {
    const queue = ["a", "b", "c", "d"];
    expect(moveQueueItem(queue, 1, 3)).toBe("a");
    expect(queue).toEqual(["b", "c", "a", "d"]);
  });

  it("returns null for out of range", () => {
    expect(moveQueueItem(["a"], 2, 1)).toBe(null);
  });
});

describe("stripQueueDupes", () => {
  it("drops later copies and matches the current track", () => {
    const queue = [
      { url: "https://youtu.be/a", title: "A" },
      { url: "https://youtu.be/b", title: "B" },
      { url: "https://youtu.be/a", title: "A again" },
    ];
    const removed = stripQueueDupes(queue, { url: "https://youtu.be/b", title: "B" });
    expect(removed).toBe(2);
    expect(queue).toEqual([{ url: "https://youtu.be/a", title: "A" }]);
  });
});
