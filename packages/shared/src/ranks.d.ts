export type KnoxRank = "owner" | "admin" | "mod" | "dj" | "member";
export declare const RANK_ORDER: Record<KnoxRank, number>;
export declare const KNOX_RANKS: KnoxRank[];
export declare function hasMinRank(userRank: KnoxRank, required: KnoxRank): boolean;
//# sourceMappingURL=ranks.d.ts.map