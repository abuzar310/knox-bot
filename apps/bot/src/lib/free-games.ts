// Games listed at $0 on CheapShark. The poller posts the ones this server has not announced yet.

export type FreeGame = { id: string; title: string; url: string; store: string };

export function parseCheapSharkDeals(body: unknown): FreeGame[] {
  if (!Array.isArray(body)) return [];
  const out: FreeGame[] = [];
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const deal = row as Record<string, unknown>;
    const price = Number(deal.salePrice);
    if (!Number.isFinite(price) || price > 0) continue;
    const id = String(deal.dealID ?? "").slice(0, 80);
    const title = String(deal.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!id || !title) continue;
    const steam = deal.steamAppID ? String(deal.steamAppID) : "";
    const url = /^\d+$/.test(steam)
      ? `https://store.steampowered.com/app/${steam}`
      : `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(id)}`;
    out.push({ id, title, url, store: "CheapShark" });
  }
  return out.slice(0, 12);
}

export function unseenGames(games: FreeGame[], seen: readonly string[]): FreeGame[] {
  const known = new Set(seen);
  return games.filter((game) => !known.has(game.id));
}

export const CHEAPSHARK_FREE_URL = "https://www.cheapshark.com/api/1.0/deals?upperPrice=0&pageSize=20&onSale=1";
