import type { KnoxModule } from "../../types.js";
import { setRankRoleCommand } from "./commands/set-rank-role.js";

const module: KnoxModule = {
  id: "admin",
  name: "Admin",
  description: "Map Discord roles to ZARU staff ranks",
  defaultEnabled: true,
  commands: [setRankRoleCommand],
};

export default module;
