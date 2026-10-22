import type { KnoxModule } from "../../types.js";
import {
  playCommand,
  addCommand,
  playNextCommand,
  playSkipCommand,
  skipCommand,
  stopCommand,
  queueCommand,
  pauseCommand,
  nowPlayingCommand,
} from "./commands/play.js";
import { searchCommand } from "./commands/search.js";
import { stayCommand } from "./commands/stay.js";
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
  moveCommand,
  removeDupesCommand,
  autoplayCommand,
  joinCommand,
  reconnectCommand,
  mixCommand,
} from "./commands/extras.js";

const module: KnoxModule = {
  id: "music",
  name: "Music",
  description: "Play YouTube and Spotify in voice, with a live control panel",
  defaultEnabled: true,
  commands: [
    playCommand,
    addCommand,
    playNextCommand,
    playSkipCommand,
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
    moveCommand,
    removeDupesCommand,
    autoplayCommand,
    joinCommand,
    reconnectCommand,
    mixCommand,
    stayCommand,
  ],
};

export default module;
