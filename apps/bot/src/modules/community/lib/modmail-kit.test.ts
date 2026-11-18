import { describe, expect, it } from "vitest";
import { REMIND_GAP_MS, STALE_MS, mailAfter, mailName, makeRenamer, staleLine, staleMail } from "./modmail-kit.js";

const now = 1_800_000_000_000;

describe("mailAfter", () => {
  it("opens when the member writes and waits once a staff answer reached them", () => {
    expect(mailAfter("waiting", "member")).toBe("open");
    expect(mailAfter("open", "staff")).toBe("waiting");
  });

  it("stays as it was when the answer could not be delivered", () => {
    expect(mailAfter("open", "staff", false)).toBe("open");
  });

  it("never reopens a closed conversation", () => {
    expect(mailAfter("closed", "member")).toBe("closed");
    expect(mailAfter("closed", "staff")).toBe("closed");
  });
});

describe("mailName", () => {
  it("puts the status in front and replaces an earlier mark", () => {
    expect(mailName("abuzar · 123", "open")).toBe("🟢 abuzar · 123");
    expect(mailName("🟢 abuzar · 123", "waiting")).toBe("🟡 abuzar · 123");
    expect(mailName("🟡 abuzar · 123", "closed")).toBe("🔒 abuzar · 123");
  });

  it("keeps within Discord's hundred characters", () => {
    expect(mailName("x".repeat(120), "open").length).toBe(100);
  });
});

describe("staleMail", () => {
  const row = (id: number, status: string, hoursAgo: number, remindedHoursAgo: number | null = null) => ({
    id,
    status,
    statusAt: new Date(now - hoursAgo * 3_600_000),
    remindedAt: remindedHoursAgo === null ? null : new Date(now - remindedHoursAgo * 3_600_000),
  });

  it("lists members waiting more than twelve hours, oldest first", () => {
    const rows = [row(1, "open", 13), row(2, "open", 11), row(3, "waiting", 40), row(4, "open", 30)];
    expect(staleMail(rows, now).map((r) => r.id)).toEqual([4, 1]);
  });

  it("brings a conversation up once a day, not every time it looks", () => {
    expect(staleMail([row(1, "open", 20, 2)], now)).toEqual([]);
    expect(staleMail([row(1, "open", 40, 25)], now).map((r) => r.id)).toEqual([1]);
    expect(STALE_MS).toBeLessThan(REMIND_GAP_MS);
  });

  it("lists a screenful at most", () => {
    const many = Array.from({ length: 30 }, (_, i) => row(i, "open", 13 + i));
    expect(staleMail(many, now)).toHaveLength(20);
  });
});

describe("staleLine", () => {
  it("links each thread with how long it has waited", () => {
    const text = staleLine([{ threadId: "77", statusAt: new Date(now) }]);
    expect(text).toContain("<#77>");
    expect(text).toContain(`<t:${now / 1000}:R>`);
  });
});

describe("makeRenamer", () => {
  it("renames at once the first time, then once per gap with the last name asked for", async () => {
    let at = now;
    const sent: string[] = [];
    const timers: { run: () => void; ms: number }[] = [];
    const renamer = makeRenamer(async (id, name) => void sent.push(`${id}:${name}`), { gapMs: 300_000, now: () => at, later: (run, ms) => timers.push({ run, ms }) });

    expect(renamer.want("t", "🟢 a")).toBe(true);
    at += 60_000;
    expect(renamer.free("t")).toBe(false);
    expect(renamer.want("t", "🟡 a")).toBe(false);
    expect(renamer.want("t", "🟢 a again")).toBe(false);
    expect(sent).toEqual(["t:🟢 a"]);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(240_000);

    at += 240_000;
    timers[0]!.run();
    expect(sent).toEqual(["t:🟢 a", "t:🟢 a again"]);

    at += 300_000;
    expect(renamer.free("t")).toBe(true);
    expect(renamer.want("other", "🟢 b")).toBe(true);
  });

  it("drops a pending name when the thread is forgotten", () => {
    let at = now;
    const sent: string[] = [];
    const timers: (() => void)[] = [];
    const renamer = makeRenamer(async (id, name) => void sent.push(`${id}:${name}`), { now: () => at, later: (run) => timers.push(run) });
    renamer.want("t", "one");
    at += 1000;
    renamer.want("t", "two");
    renamer.forget("t");
    timers[0]!();
    expect(sent).toEqual(["t:one"]);
  });
});
