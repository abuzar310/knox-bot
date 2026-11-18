// The message filter driven with stand-in Discord messages: what a new message and an edited one lead to.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guildSettingsSchema } from "@knox/config";

vi.mock("../lib/cases.js", () => ({ createCase: vi.fn(async () => ({ caseNumber: 1 })) }));
vi.mock("../lib/modlog.js", () => ({ sendModLog: vi.fn(async () => undefined), logLine: vi.fn(async () => undefined), protectedBlock: () => false }));
vi.mock("../../../lib/ai-moderation.js", () => ({ classifyMessage: vi.fn(async () => null) }));
vi.mock("../../../lib/safety/phish-list.js", () => ({ findPhishingHost: () => null, refreshPhishList: async () => undefined }));
vi.mock("../../../logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { logLine } from "../lib/modlog.js";
import { automodEditEvent, automodEvent } from "./automod.js";

const HOUR = 3_600_000;
const base = guildSettingsSchema.parse({});
let userNo = 0;

type Over = { content?: string; ageHours?: number; staff?: boolean; days?: number; editedAgoMs?: number | null; deleteError?: { code: number } };

/** a message as the filter reads it; every test gets a member of its own, so one test's notice does not quiet the next */
function fake(over: Over = {}) {
  const userId = `user-${++userNo}`;
  const settings = { ...base, moderation: { ...base.moderation, antiPhishing: false, newAccountLinkDays: over.days ?? 3 } };
  const member = { permissions: { has: () => over.staff ?? false }, roles: { cache: new Map() }, timeout: vi.fn(async () => undefined) };
  const send = vi.fn(async (_payload: unknown) => ({ delete: vi.fn(async () => undefined) }));
  const message = {
    id: `message-${userNo}`,
    guild: { id: "guild", members: { fetch: vi.fn(async () => null) } },
    guildId: "guild",
    channelId: "channel",
    content: over.content ?? "look https://example.com",
    author: { id: userId, bot: false, tag: "newcomer", createdTimestamp: Date.now() - (over.ageHours ?? 1) * HOUR },
    member,
    mentions: { users: { size: 0 }, roles: { size: 0 } },
    attachments: { size: 0 },
    partial: false,
    editedTimestamp: over.editedAgoMs == null ? null : Date.now() - over.editedAgoMs,
    url: "https://discord.com/channels/guild/channel/message",
    delete: vi.fn(async () => {
      if (over.deleteError) throw over.deleteError;
    }),
    channel: { send },
    client: { user: { id: "bot" }, db: {}, guildConfig: { get: vi.fn(async () => ({ settings })) } },
  };
  return { message, member, send, userId };
}

const post = (made: ReturnType<typeof fake>) => automodEvent.execute(made.message as never);
const edit = (before: { content: string | null; partial: boolean }, after: unknown) => automodEditEvent.execute(before, after);

beforeEach(() => vi.mocked(logLine).mockClear());

describe("a link from a new account", () => {
  it("is deleted with one word to the member and one line in the log, and no timeout", async () => {
    const made = fake();
    await post(made);
    expect(made.message.delete).toHaveBeenCalledTimes(1);
    expect(made.send).toHaveBeenCalledTimes(1);
    const payload = made.send.mock.calls[0]![0] as { content: string; allowedMentions: unknown };
    expect(payload.content).toContain(`<@${made.userId}>`);
    expect(payload.content).toContain("younger than 3 days");
    expect(payload.allowedMentions).toEqual({ users: [made.userId] });
    expect(logLine).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logLine).mock.calls[0]![2]).toBe("Link from a new account removed");
    expect(made.member.timeout).not.toHaveBeenCalled();
  });

  it("is deleted again within ten minutes, without a second notice", async () => {
    const made = fake();
    await post(made);
    await post(made);
    expect(made.message.delete).toHaveBeenCalledTimes(2);
    expect(made.send).toHaveBeenCalledTimes(1);
    expect(logLine).toHaveBeenCalledTimes(1);
  });

  it("times the account out when the links come as a flood", async () => {
    const made = fake();
    for (let i = 0; i < 6; i++) await post(made);
    expect(made.message.delete.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(made.member.timeout).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the message could not be deleted", async () => {
    const made = fake({ deleteError: { code: 50013 } });
    await post(made);
    expect(made.send).not.toHaveBeenCalled();
    expect(logLine).not.toHaveBeenCalled();
  });

  it("is left alone when the rule is off, the account is old enough, the member is staff, or it is a GIF", async () => {
    for (const over of [{ days: 0 }, { ageHours: 72 }, { staff: true }, { content: "https://tenor.com/view/hello-gif-1" }, { content: "hi everyone" }] as Over[]) {
      const made = fake(over);
      await post(made);
      expect(made.message.delete, JSON.stringify(over)).not.toHaveBeenCalled();
    }
  });
});

describe("an edited message", () => {
  it("is checked like a new one: a link edited in by a new account is deleted", async () => {
    const made = fake({ editedAgoMs: 1000 });
    await edit({ content: "hi", partial: false }, made.message);
    expect(made.message.delete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logLine).mock.calls[0]![3]).toContain("edited into a message");
  });

  it("gets the invite rule too, with its timeout", async () => {
    const made = fake({ content: "join discord.gg/abc123", ageHours: 9000, editedAgoMs: 1000 });
    await edit({ content: "hi", partial: false }, made.message);
    expect(made.message.delete).toHaveBeenCalledTimes(1);
    expect(made.member.timeout).toHaveBeenCalledTimes(1);
  });

  it("is not a pin or a link preview: same text, never edited, or edited long ago", async () => {
    const same = fake({ editedAgoMs: 1000 });
    await edit({ content: same.message.content, partial: false }, same.message);
    const never = fake({ editedAgoMs: null });
    await edit({ content: null, partial: true }, never.message);
    const old = fake({ editedAgoMs: 10 * 60_000 });
    await edit({ content: null, partial: true }, old.message);
    for (const made of [same, never, old]) expect(made.message.delete).not.toHaveBeenCalled();
  });

  it("is fetched first when Discord sent only part of it", async () => {
    const made = fake({ editedAgoMs: 1000 });
    const partial = { partial: true, guild: made.message.guild, author: null, editedTimestamp: made.message.editedTimestamp, content: null, fetch: vi.fn(async () => made.message) };
    await edit({ content: null, partial: true }, partial);
    expect(partial.fetch).toHaveBeenCalledTimes(1);
    expect(made.message.delete).toHaveBeenCalledTimes(1);
  });

  it("is never counted as spam, however often it is edited", async () => {
    const made = fake({ content: "just talking", editedAgoMs: 1000 });
    for (let i = 0; i < 8; i++) await edit({ content: `draft ${i}`, partial: false }, made.message);
    expect(made.message.delete).not.toHaveBeenCalled();
    expect(made.member.timeout).not.toHaveBeenCalled();
  });

  it("does nothing when the member cannot be read", async () => {
    const made = fake({ editedAgoMs: 1000 });
    const memberless = { ...made.message, member: null };
    await edit({ content: "hi", partial: false }, memberless);
    expect(made.message.guild.members.fetch).toHaveBeenCalledTimes(1);
    expect(made.message.delete).not.toHaveBeenCalled();
  });
});
