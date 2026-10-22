import { describe, expect, it } from "vitest";
import { fairInsert, isFillerTrack, moveQueueItem, stripQueueDupes } from "./queue-ops.js";

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

describe("isFillerTrack", () => {
  it("marks radio and autoplay only", () => {
    expect(isFillerTrack({ requestedBy: "24/7" })).toBe(true);
    expect(isFillerTrack({ requestedBy: "autoplay" })).toBe(true);
    expect(isFillerTrack({ requestedBy: "abuzar" })).toBe(false);
  });
});

describe("fairInsert", () => {
  it("puts a new requester after the first other song", () => {
    const queue = [
      { title: "a1", requestedBy: "A" },
      { title: "a2", requestedBy: "A" },
      { title: "a3", requestedBy: "A" },
    ];
    fairInsert(queue, [{ title: "b1", requestedBy: "B" }]);
    expect(queue.map((t) => t.title)).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("keeps a dump in order instead of reversing it", () => {
    const queue = [
      { title: "a1", requestedBy: "A" },
      { title: "a2", requestedBy: "A" },
    ];
    fairInsert(queue, [
      { title: "b1", requestedBy: "B" },
      { title: "b2", requestedBy: "B" },
    ]);
    expect(queue.map((t) => t.title)).toEqual(["a1", "b1", "b2", "a2"]);
  });
});
