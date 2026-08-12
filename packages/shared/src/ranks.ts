export type KnoxRank = "owner" | "admin" | "mod" | "dj" | "member";

export const RANK_ORDER: Record<KnoxRank, number> = {
  owner: 100,
  admin: 80,
  mod: 60,
  dj: 40,
  member: 0,
};

export const KNOX_RANKS: KnoxRank[] = ["owner", "admin", "mod", "dj", "member"];

export function hasMinRank(userRank: KnoxRank, required: KnoxRank): boolean {
  return RANK_ORDER[userRank] >= RANK_ORDER[required];
}
