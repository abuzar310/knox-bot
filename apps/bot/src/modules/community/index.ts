import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { setupCommand } from "./commands/setup.js";
import { invitesCommand } from "./commands/invites.js";
import { ticketCommand } from "./commands/ticket.js";
import { giveawayCommand } from "./commands/giveaway.js";
import {
  tagCommand,
  afkCommand,
  snipeCommand,
  pollCommand,
  reminderCommand,
  suggestCommand,
  verifyCommand,
  reactionRoleCommand,
} from "./commands/tools.js";
import {
  starboardCommand,
  loggingCommand,
  voiceHubCommand,
  countingCommand,
  serverStatsCommand,
  embedCommand,
} from "./commands/server.js";
import {
  inviteCreateEvent,
  inviteDeleteEvent,
  readyInvitesEvent,
} from "./events/invites-sync.js";
import { memberAddEvent, memberRemoveEvent } from "./events/members.js";
import { messageDeleteLog, messageUpdateLog } from "./events/logging.js";
import { starboardEvent } from "./events/starboard.js";
import { voiceHubEvent, voiceLogEvent } from "./events/voice.js";
import { countingEvent, afkClearEvent } from "./events/chat.js";

const module: KnoxModule = {
  id: "community",
  name: "Community",
  description: "Setup, tickets, giveaways, starboard, tags, logs, voice hubs",
  defaultEnabled: true,
  commands: [
    setupCommand,
    invitesCommand,
    ticketCommand,
    giveawayCommand,
    tagCommand,
    afkCommand,
    snipeCommand,
    pollCommand,
    reminderCommand,
    suggestCommand,
    verifyCommand,
    reactionRoleCommand,
    starboardCommand,
    loggingCommand,
    voiceHubCommand,
    countingCommand,
    serverStatsCommand,
    embedCommand,
  ],
  events: [
    readyInvitesEvent,
    inviteCreateEvent,
    inviteDeleteEvent,
    memberAddEvent,
    memberRemoveEvent,
    messageDeleteLog,
    messageUpdateLog,
    starboardEvent,
    voiceHubEvent,
    voiceLogEvent,
    countingEvent,
    afkClearEvent,
  ] as KnoxBoundEvent[],
};

export default module;
