import type { KnoxModule } from "../../types.js";
import { pingCommand } from "./commands/ping.js";
import { helpCommand } from "./commands/help.js";
import { modulesCommand } from "./commands/modules.js";
import { configCommand } from "./commands/config.js";

const module: KnoxModule = {
  id: "core",
  name: "Core",
  description: "Ping, help, modules, config",
  defaultEnabled: true,
  commands: [pingCommand, helpCommand, modulesCommand, configCommand],
};

export default module;
