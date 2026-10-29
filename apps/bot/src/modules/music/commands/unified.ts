import { SlashCommandBuilder, SlashCommandSubcommandGroupBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { applyLeafOptions, mergeIntoSubcommands } from "../../../lib/slash-merge.js";
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
} from "./play.js";
import { searchCommand } from "./search.js";
import { stayCommand } from "./stay.js";
import { roomCommand } from "./room.js";
import { filterCommand, playlistCommand } from "./collection.js";
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
} from "./extras.js";

const PLAYBACK = [
  playCommand,
  addCommand,
  playNextCommand,
  playSkipCommand,
  searchCommand,
  skipCommand,
  stopCommand,
  pauseCommand,
  nowPlayingCommand,
  lyricsCommand,
  leaveCommand,
  joinCommand,
  reconnectCommand,
  autoplayCommand,
  filterCommand,
];

const QUEUE_GROUP = [
  queueCommand,
  removeCommand,
  skipToCommand,
  clearCommand,
  volumeCommand,
  loopCommand,
  shuffleCommand,
  seekCommand,
  moveCommand,
  removeDupesCommand,
];

const GROUPED = [mixCommand, playlistCommand, stayCommand, roomCommand];

const dispatch = new Map<string, KnoxCommand>();
for (const c of [...PLAYBACK, ...QUEUE_GROUP, ...GROUPED]) dispatch.set(c.data.name, c);

function appendAsSubcommand(group: SlashCommandSubcommandGroupBuilder, cmd: KnoxCommand) {
  const j = cmd.data.toJSON();
  group.addSubcommand((s) => {
    s.setName(j.name).setDescription(j.description);
    applyLeafOptions(s, j.options);
    return s;
  });
}

const data = (() => {
  const root = new SlashCommandBuilder().setName("music").setDescription("Play YouTube/Spotify in voice — queue, filters, playlists, 24/7 stay");
  mergeIntoSubcommands(root, PLAYBACK);
  root.addSubcommandGroup((grp) => {
    grp.setName("queue").setDescription("Queue and playback controls");
    for (const cmd of QUEUE_GROUP) appendAsSubcommand(grp, cmd);
    return grp;
  });
  mergeIntoSubcommands(root, GROUPED);
  return root;
})();

export const musicUnifiedCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data,
  async execute(interaction, ctx) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand(true);
    const cmd = group === "queue" ? dispatch.get(sub) : group ? dispatch.get(group) : dispatch.get(sub);
    if (!cmd) {
      await interaction.reply({ content: "Unknown music subcommand.", ephemeral: true });
      return;
    }
    await cmd.execute(interaction, ctx);
  },
};
