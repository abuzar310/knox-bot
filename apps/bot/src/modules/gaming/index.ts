import type { KnoxModule } from "../../types.js";
import { lfgCommand, funCommand } from "./commands/play.js";

const module: KnoxModule = {
  id: "gaming",
  name: "Gaming",
  description: "LFG, RPS, coinflip, trivia",
  defaultEnabled: true,
  commands: [lfgCommand, funCommand],
};

export default module;
