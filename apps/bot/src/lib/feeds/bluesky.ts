// Bluesky posts through the public AppView (no key): an account's own posts, newest first, as feed items.
import { fetchJson, HttpError } from "./http.js";
import { SourceError } from "./errors.js";
import type { FeedDoc, FeedItem } from "./rss.js";

const HANDLE = /^[a-z0-9][a-z0-9.-]{1,252}\.[a-z]{2,}$/i;

/** @handle, bare name, bsky.app profile link or did:plc → the actor to ask for */
export function blueskyActorFrom(input: string): string | null {
  let typed = input.trim().replace(/^@/, "");
  const link = typed.match(/^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/?#\s]+)/i);
  if (link?.[1]) typed = link[1];
  if (/^did:plc:[a-z0-9]+$/i.test(typed)) return typed;
  if (HANDLE.test(typed)) return typed.toLowerCase();
  if (/^[a-z0-9-]{3,20}$/i.test(typed)) return `${typed.toLowerCase()}.bsky.social`;
  return null;
}

type AuthorFeed = {
  feed?: Array<{
    post?: { uri?: string; author?: { handle?: string; displayName?: string }; record?: { text?: string; createdAt?: string } };
    reason?: unknown;
  }>;
};

export async function fetchBlueskyFeed(actor: string): Promise<FeedDoc> {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=20&filter=posts_no_replies`;
  let data: AuthorFeed;
  try {
    data = await fetchJson<AuthorFeed>(url);
  } catch (err) {
    if (err instanceof HttpError && (err.status === 400 || err.status === 404)) throw new SourceError(`No Bluesky account called **${actor}**.`);
    throw err;
  }
  const items: FeedItem[] = [];
  let title = actor;
  for (const entry of data.feed ?? []) {
    if (entry.reason) continue; // reposts
    const post = entry.post;
    if (!post?.uri) continue;
    const rkey = post.uri.split("/").pop() ?? "";
    const handle = post.author?.handle ?? actor;
    const author = post.author?.displayName || handle;
    title = author;
    const text = (post.record?.text ?? "").replace(/\s+/g, " ").trim();
    items.push({
      id: post.uri,
      title: text.length > 120 ? `${text.slice(0, 117)}…` : text || "(no text)",
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      author,
      publishedAt: post.record?.createdAt ? new Date(post.record.createdAt) : null,
    });
  }
  return { title, items };
}
