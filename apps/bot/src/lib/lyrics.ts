export async function fetchLyrics(title: string, artist: string) {
  const query = [title.replace(/\(.*?\)/g, "").split("|")[0]?.trim() || title, artist].filter(Boolean).join(" ");
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
    headers: { "user-agent": "knox-bot" },
  });
  if (!res.ok) return null;
  const hits = (await res.json()) as Array<{ plainLyrics?: string; syncedLyrics?: string; trackName?: string }>;
  const hit = hits.find((item) => item.plainLyrics || item.syncedLyrics);
  if (!hit) return null;
  const text = hit.plainLyrics || hit.syncedLyrics?.replace(/\[\d+:\d+[.\d]*\]/g, "").trim() || null;
  return text?.slice(0, 3900) ?? null;
}
