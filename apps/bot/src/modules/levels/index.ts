import type { KnoxModule } from "../../types.js";
import { rankCommand, levelsCommand, levelAdminCommand, profileCommand } from "./commands/level.js";
import { ecoCommand } from "./commands/eco.js";
import { repCommand, birthdayCommand } from "./commands/social.js";
import { shopCommand } from "./commands/shop.js";
import { gambleCommand } from "./commands/gamble.js";
import { lotteryCommand } from "./commands/lottery.js";
import { animalCommand } from "./commands/animal.js";
import { chickenCommand } from "./commands/chicken.js";
import { xpEvent } from "./events/xp.js";
import { chatMoneyEvent } from "./events/chat-money.js";

const module: KnoxModule = {
  id: "levels",
  name: "Levels",
  description: "Chat and voice XP, ranks, coins, a shop, slots, reputation, and birthdays",
  defaultEnabled: true,
  commands: [rankCommand, profileCommand, levelsCommand, levelAdminCommand, ecoCommand, shopCommand, gambleCommand, lotteryCommand, animalCommand, chickenCommand, repCommand, birthdayCommand],
  events: [xpEvent, chatMoneyEvent],
};

export default module;
