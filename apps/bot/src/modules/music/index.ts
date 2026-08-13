import type { KnoxModule } from "../../types.js";
import {
  playCommand,
  playNextCommand,
  skipCommand,
  stopCommand,
  queueCommand,
  pauseCommand,
  nowPlayingCommand,
} from "./commands/play.js";
import { searchCommand } from "./commands/search.js";

const module: KnoxModule = {
  id: "music",
  name: "Music",
  description: "YouTube + Spotify playback in voice",
  defaultEnabled: true,
  commands: [
    playCommand,
    playNextCommand,
    searchCommand,
    skipCommand,
    stopCommand,
    pauseCommand,
    nowPlayingCommand,
    queueCommand,
  ],
};

export default module;
