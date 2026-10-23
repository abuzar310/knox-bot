import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { feedCommand } from "./commands/feed.js";
import { autoPublishEvent } from "./events/autopublish.js";

const module: KnoxModule = {
  id: "alerts",
  name: "Alerts",
  description: "YouTube, RSS, Twitch and Kick notifications, plus auto-publish for announcement channels",
  defaultEnabled: true,
  commands: [feedCommand],
  events: [autoPublishEvent] as KnoxBoundEvent[],
};

export default module;
