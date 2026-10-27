// UnbelievaBoat-style bare-word commands. ZARU's economy lives under /eco, /gamble and /shop for the 100-slash-command
// cap, but people expect to type "!work", "!bal", "!crime", "!bj" like UnbelievaBoat. These aliases rewrite a bare word
// into its real command + subcommand for the PREFIX path only, so the typing experience matches exactly.
export const COMMAND_ALIASES: Record<string, string> = {
  // balance / banking
  balance: "eco balance",
  bal: "eco balance",
  cash: "eco balance",
  wallet: "eco balance",
  bank: "eco balance",
  deposit: "eco deposit",
  dep: "eco deposit",
  withdraw: "eco withdraw",
  with: "eco withdraw",
  give: "eco pay",
  // earning
  daily: "eco daily",
  work: "eco work",
  fish: "eco fish",
  fishing: "eco fish",
  hunt: "eco hunt",
  hunting: "eco hunt",
  crime: "eco crime",
  slut: "eco crime",
  rob: "eco rob",
  steal: "eco rob",
  collect: "eco collect",
  // leaderboards
  leaderboard: "eco top",
  lb: "eco top",
  rich: "eco top",
  baltop: "eco top",
  // casino
  slots: "gamble slots",
  slot: "gamble slots",
  blackjack: "gamble blackjack",
  bj: "gamble blackjack",
  "21": "gamble blackjack",
  roulette: "gamble roulette",
  roul: "gamble roulette",
  coinflip: "gamble coinflip",
  cf: "gamble coinflip",
  flip: "gamble coinflip",
  // shop / items
  store: "shop list",
  buy: "shop buy",
  inventory: "shop inventory",
  inv: "shop inventory",
  items: "shop inventory",
  // lottery
  lotto: "lottery info",
};
