import type { FeedKind } from "@knox/db";

export type AlertVars = {
  role: string;
  author: string;
  title: string;
  url: string;
  game: string;
  viewers: string;
  server: string;
};

export const DEFAULT_TEMPLATES: Record<FeedKind, string> = {
  youtube: "{role} **{author}** uploaded **{title}**\n{url}",
  rss: "{role} **{author}**: **{title}**\n{url}",
  twitch: "{role} **{author}** is live on Twitch: **{title}** · {game}\n{url}",
  kick: "{role} **{author}** is live on Kick: **{title}** · {game}\n{url}",
  bluesky: "{role} **{author}** on Bluesky: {title}\n{url}",
};

export const PLACEHOLDERS = "{role} {author} {title} {url} {game} {viewers} {server}";

/** fills a feed's message (or the kind's default) and keeps it inside Discord's content limit */
export function renderAlert(template: string | null | undefined, kind: FeedKind, vars: AlertVars): string {
  const source = template?.trim() || DEFAULT_TEMPLATES[kind];
  return source
    .replace(/\{(role|author|title|url|game|viewers|server)\}/g, (_match, key: keyof AlertVars) => vars[key] ?? "")
    .replace(/^\s+/, "")
    .slice(0, 1900);
}
