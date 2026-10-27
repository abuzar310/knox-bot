import type { KnoxModule } from "../../types.js";
import { rankCommand, levelsCommand, levelAdminCommand } from "./commands/level.js";
import { ecoCommand } from "./commands/eco.js";
import { repCommand, birthdayCommand } from "./commands/social.js";
import { shopCommand } from "./commands/shop.js";
import { gambleCommand } from "./commands/gamble.js";
import { lotteryCommand } from "./commands/lottery.js";
import { xpEvent } from "./events/xp.js";

const module: KnoxModule = {
  id: "levels",
  name: "Levels",
  description: "Chat and voice XP, ranks, coins, a shop, slots, reputation, and birthdays",
  defaultEnabled: true,
  commands: [rankCommand, levelsCommand, levelAdminCommand, ecoCommand, shopCommand, gambleCommand, lotteryCommand, repCommand, birthdayCommand],
  events: [xpEvent],
};

export default module;
