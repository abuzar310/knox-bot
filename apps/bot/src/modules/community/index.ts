import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { setupCommand } from "./commands/setup.js";
import { invitesCommand } from "./commands/invites.js";
import {
  inviteCreateEvent,
  inviteDeleteEvent,
  readyInvitesEvent,
} from "./events/invites-sync.js";
import { memberAddEvent, memberRemoveEvent } from "./events/members.js";

const module: KnoxModule = {
  id: "community",
  name: "Community",
  description: "Setup, welcome, goodbye, invite tracker, autorole, server templates",
  defaultEnabled: true,
  commands: [setupCommand, invitesCommand],
  events: [
    readyInvitesEvent,
    inviteCreateEvent,
    inviteDeleteEvent,
    memberAddEvent,
    memberRemoveEvent,
  ] as KnoxBoundEvent[],
};

export default module;
