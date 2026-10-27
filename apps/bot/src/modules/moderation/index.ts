import type { KnoxBoundEvent, KnoxModule } from "../../types.js";
import { warnCommand } from "./commands/warn.js";
import { muteCommand } from "./commands/mute.js";
import { unmuteCommand } from "./commands/unmute.js";
import { kickCommand } from "./commands/kick.js";
import { banCommand } from "./commands/ban.js";
import { unbanCommand } from "./commands/unban.js";
import { caseCommand } from "./commands/case.js";
import { historyCommand } from "./commands/history.js";
import { lockCommand, purgeCommand, slowmodeCommand, tempbanCommand, unlockCommand } from "./commands/extras.js";
import { raidmodeCommand } from "./commands/raidmode.js";
import { antiraidCommand } from "./commands/antiraid.js";
import { automodCommand } from "./commands/automod.js";
import { temproleCommand } from "./commands/temprole.js";
import { decancerCommand } from "./commands/decancer.js";
import { decancerJoinEvent, decancerRenameEvent } from "./events/decancer.js";
import { automodEvent } from "./events/automod.js";
import { joinGateEvent } from "./events/join-gate.js";
import { serverGuardEvent } from "./events/server-guard.js";
import { refreshPhishList } from "../../lib/safety/phish-list.js";

const module: KnoxModule = {
  id: "moderation",
  name: "Moderation",
  description: "Warn, mute, kick, ban, tempban, purge, lock, slowmode, numbered cases, automod (ZARU and Discord-native), anti-phishing, join gate and raid mode",
  defaultEnabled: true,
  commands: [
    warnCommand,
    muteCommand,
    unmuteCommand,
    kickCommand,
    banCommand,
    tempbanCommand,
    unbanCommand,
    purgeCommand,
    slowmodeCommand,
    lockCommand,
    unlockCommand,
    caseCommand,
    historyCommand,
    raidmodeCommand,
    antiraidCommand,
    automodCommand,
    temproleCommand,
    decancerCommand,
  ],
  events: [automodEvent as KnoxBoundEvent, joinGateEvent, decancerJoinEvent, decancerRenameEvent, serverGuardEvent],
  onLoad() {
    // the scam-domain lists are fetched in the background so the first messages are already covered
    void refreshPhishList();
  },
};

export default module;
