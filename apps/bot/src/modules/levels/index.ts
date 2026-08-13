import type { KnoxModule } from "../../types.js";
import { rankCommand, levelsCommand, levelAdminCommand } from "./commands/level.js";
import { ecoCommand } from "./commands/eco.js";
import { repCommand, birthdayCommand } from "./commands/social.js";
import { xpEvent } from "./events/xp.js";

const module: KnoxModule = {
  id: "levels",
  name: "Levels",
  description: "Chat XP, ranks, coins, reputation, and birthdays",
  defaultEnabled: true,
  commands: [rankCommand, levelsCommand, levelAdminCommand, ecoCommand, repCommand, birthdayCommand],
  events: [xpEvent],
};

export default module;
