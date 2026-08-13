import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { warnCommand } from "./commands/warn.js";
import { muteCommand } from "./commands/mute.js";
import { unmuteCommand } from "./commands/unmute.js";
import { kickCommand } from "./commands/kick.js";
import { banCommand } from "./commands/ban.js";
import { unbanCommand } from "./commands/unban.js";
import { caseCommand } from "./commands/case.js";
import { historyCommand } from "./commands/history.js";
import { automodEvent } from "./events/automod.js";

const module: KnoxModule = {
  id: "moderation",
  name: "Moderation",
  description: "Warn, mute, kick, ban, numbered cases, and automod",
  defaultEnabled: true,
  commands: [
    warnCommand,
    muteCommand,
    unmuteCommand,
    kickCommand,
    banCommand,
    unbanCommand,
    caseCommand,
    historyCommand,
  ],
  events: [automodEvent as KnoxBoundEvent],
};

export default module;
