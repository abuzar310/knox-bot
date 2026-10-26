import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { setRankRoleCommand } from "./commands/set-rank-role.js";
import { zaruCommand } from "./commands/zaru.js";
import { assistantEvent } from "./events/assistant.js";

const module: KnoxModule = {
  id: "admin",
  name: "Admin",
  description: "Staff ranks, and the ZARU assistant that takes instructions in plain words",
  defaultEnabled: true,
  commands: [setRankRoleCommand, zaruCommand],
  events: [assistantEvent] as KnoxBoundEvent[],
};

export default module;
