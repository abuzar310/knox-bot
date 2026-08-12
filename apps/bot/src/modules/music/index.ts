import type { KnoxModule } from "../../types.js";
import { playCommand, skipCommand, stopCommand, queueCommand } from "./commands/play.js";

const module: KnoxModule = {
  id: "music",
  name: "Music",
  description: "Queue direct audio/radio streams",
  defaultEnabled: true,
  commands: [playCommand, skipCommand, stopCommand, queueCommand],
};

export default module;
