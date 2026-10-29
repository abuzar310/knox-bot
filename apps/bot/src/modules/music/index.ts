import type { KnoxModule } from "../../types.js";
import { musicUnifiedCommand } from "./commands/unified.js";
import { musicRequestEvent } from "./events/requests.js";

const module: KnoxModule = {
  id: "music",
  name: "Music",
  description: "Play YouTube and Spotify in voice, with a live control panel",
  defaultEnabled: true,
  commands: [musicUnifiedCommand],
  events: [musicRequestEvent],
};

export default module;
