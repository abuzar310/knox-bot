import { describe, expect, it } from "vitest";
import { addLesson, lessonFrom, lessonStandsAlone, lessonsBrief } from "./lessons.js";

describe("lessons", () => {
  it("keeps a correction about how to answer, and a fact", () => {
    const correction = "whom did you give you should answer like these guys didn't have I have gave them";
    expect(lessonFrom(correction)).toBe(correction);
    expect(lessonStandsAlone(correction)).toBe(false);
    expect(lessonFrom("Suhaib is my brother")).toBe("Suhaib is my brother");
    expect(lessonStandsAlone("Suhaib is my brother")).toBe(true);
  });

  it("does not treat an order or a normal question as a lesson", () => {
    expect(lessonFrom("check and give every person who doesn't have member role")).toBe("");
    expect(lessonFrom("who made you")).toBe("");
    expect(lessonFrom("who tried to ban me")).toBe("");
  });

  it("replaces the same sentence and keeps the newest", () => {
    const first = addLesson([], { text: "Suhaib is my brother", by: "Abuzar", at: "1" });
    const again = addLesson(first, { text: "Suhaib is my brother", by: "Abuzar", at: "2" });
    expect(again).toHaveLength(1);
    expect(again[0]?.at).toBe("2");
    expect(lessonsBrief(again)).toMatch(/Suhaib is my brother/);
    expect(lessonsBrief([])).toBe("");
  });
});
