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
import {
  removeCommand,
  skipToCommand,
  clearCommand,
  volumeCommand,
  loopCommand,
  shuffleCommand,
  seekCommand,
  lyricsCommand,
  leaveCommand,
} from "./commands/extras.js";

const module: KnoxModule = {
  id: "music",
  name: "Music",
  description: "Play YouTube and Spotify in voice, with a live control panel",
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
    removeCommand,
    skipToCommand,
    clearCommand,
    volumeCommand,
    loopCommand,
    shuffleCommand,
    seekCommand,
    lyricsCommand,
    leaveCommand,
  ],
};

export default module;
