import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { setupCommand } from "./commands/setup.js";
import { invitesCommand } from "./commands/invites.js";
import { ticketCommand } from "./commands/ticket.js";
import { giveawayCommand } from "./commands/giveaway.js";
import { suggestionCommand } from "./commands/suggestion.js";
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
import { autoThreadCommand, stickyCommand } from "./commands/engagement.js";
import { scheduleCommand } from "./commands/schedule.js";
import { applyCommand, applyFormCommand } from "./commands/apply.js";
import { modmailCommand } from "./commands/modmail.js";
import { highlightCommand } from "./commands/highlight.js";
import { statsCommand } from "./commands/stats.js";
import { communityCommand } from "./commands/community.js";
import { autoResponseCommand } from "./commands/autoresponse.js";
import { confessCommand } from "./commands/confess.js";
import { roleMenuCommand } from "./commands/rolemenu.js";
import {
  inviteCreateEvent,
  inviteDeleteEvent,
  readyInvitesEvent,
} from "./events/invites-sync.js";
import { memberAddEvent, memberRemoveEvent } from "./events/members.js";
import { messageDeleteLog, messageUpdateLog } from "./events/logging.js";
import { starboardEvent, starboardRemoveEvent } from "./events/starboard.js";
import { tempVoiceSweepEvent, voiceHubEvent, voiceLogEvent } from "./events/voice.js";
import { countingEvent, afkClearEvent } from "./events/chat.js";
import { autoThreadEvent, bumpEvent, stickyEvent, stickySweepEvent } from "./events/engagement.js";
import { modmailDmEvent, modmailSweepEvent, modmailThreadEvent } from "./events/modmail.js";
import { highlightsEvent, highlightsSweepEvent } from "./events/highlights.js";
import { eventCreatedEvent, statsMessageEvent } from "./events/stats.js";
import { memberUpdateLog } from "./events/member-log.js";
import { autoResponseEvent, autoResponseSweepEvent } from "./events/auto-response.js";
import { aiChatEvent } from "./events/ai-chat.js";
import { guildJoinPromptEvent, introduceExistingEvent } from "./events/guild-join.js";

const module: KnoxModule = {
  id: "community",
  name: "Community",
  description: "Welcome, invites, tickets, giveaways, starboard, sticky notes, auto-threads, applications, modmail, and server tools",
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
    suggestionCommand,
    verifyCommand,
    reactionRoleCommand,
    starboardCommand,
    loggingCommand,
    voiceHubCommand,
    countingCommand,
    serverStatsCommand,
    embedCommand,
    stickyCommand,
    autoThreadCommand,
    scheduleCommand,
    applyFormCommand,
    applyCommand,
    modmailCommand,
    highlightCommand,
    statsCommand,
    communityCommand,
    autoResponseCommand,
    confessCommand,
    roleMenuCommand,
  ],
  events: [
    aiChatEvent,
    readyInvitesEvent,
    inviteCreateEvent,
    inviteDeleteEvent,
    memberAddEvent,
    memberRemoveEvent,
    messageDeleteLog,
    messageUpdateLog,
    starboardEvent,
    starboardRemoveEvent,
    voiceHubEvent,
    tempVoiceSweepEvent,
    voiceLogEvent,
    countingEvent,
    afkClearEvent,
    stickySweepEvent,
    stickyEvent,
    autoThreadEvent,
    bumpEvent,
    modmailSweepEvent,
    modmailDmEvent,
    modmailThreadEvent,
    highlightsSweepEvent,
    highlightsEvent,
    statsMessageEvent,
    eventCreatedEvent,
    memberUpdateLog,
    autoResponseSweepEvent,
    autoResponseEvent,
    guildJoinPromptEvent,
    introduceExistingEvent,
  ] as KnoxBoundEvent[],
};

export default module;
