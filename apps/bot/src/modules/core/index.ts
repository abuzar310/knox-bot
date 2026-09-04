import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { pingCommand } from "./commands/ping.js";
import { helpCommand } from "./commands/help.js";
import { modulesCommand } from "./commands/modules.js";
import { configCommand } from "./commands/config.js";
import { prefixCommand } from "./commands/prefix.js";
import { guildJoinEvent } from "./events/guild-join.js";
import { prefixMessageEvent } from "./events/prefix.js";

const module: KnoxModule = {
  id: "core",
  name: "Core",
  description: "Help, ping, prefix, modules, and this server's config",
  defaultEnabled: true,
  commands: [pingCommand, helpCommand, modulesCommand, configCommand, prefixCommand],
  events: [guildJoinEvent, prefixMessageEvent] as KnoxBoundEvent[],
};

export default module;
