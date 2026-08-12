import type { KnoxModule } from "../../types.js";
import {
  playCommand,
  skipCommand,
  stopCommand,
  queueCommand,
  pauseCommand,
  nowPlayingCommand,
} from "./commands/play.js";

const module: KnoxModule = {
  id: "music",
  name: "Music",
  description: "YouTube + Spotify playback in voice",
  defaultEnabled: true,
  commands: [playCommand, skipCommand, stopCommand, pauseCommand, nowPlayingCommand, queueCommand],
  async onLoad(client) {
    const { attachPlayer } = await import("../../lib/player.js");
    await attachPlayer(client);
  },
};

export default module;
