/** "above Music" / "below #music" — put one channel next to another instead of both at the top */
export function besidePlacement(name: string | undefined): { side: "above" | "below"; anchor: string } | null {
  const match = /^(above|below)\s+(.+)$/i.exec(name?.trim() ?? "");
  if (!match) return null;
  const anchor = match[2].trim();
  if (!anchor) return null;
  return { side: match[1].toLowerCase() as "above" | "below", anchor };
}
