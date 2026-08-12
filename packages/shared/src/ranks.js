export const RANK_ORDER = {
    owner: 100,
    admin: 80,
    mod: 60,
    dj: 40,
    member: 0,
};
export const KNOX_RANKS = ["owner", "admin", "mod", "dj", "member"];
export function hasMinRank(userRank, required) {
    return RANK_ORDER[userRank] >= RANK_ORDER[required];
}
//# sourceMappingURL=ranks.js.map