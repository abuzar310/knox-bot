// One event powers three features: anti-nuke (stop a runaway admin/bot), cases for moderation done by hand,
// and the server audit log (who did what).
import { Events, type Guild, type GuildAuditLogsEntry } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { guardAgainstNuke } from "../../../lib/anti-nuke.js";
import { logServerAction } from "../../../lib/audit-log.js";
import { streamChannelId } from "../../../lib/log-target.js";
import { logger } from "../../../logger.js";
import { recordAuditCase } from "../lib/audit-case-recorder.js";

export const serverGuardEvent: KnoxBoundEvent = {
  name: Events.GuildAuditLogEntryCreate,
  async execute(...args: unknown[]) {
    const entry = args[0] as GuildAuditLogsEntry;
    const guild = args[1] as Guild;
    if (!guild) return;
    const client = guild.client as KnoxClient;
    const cached = await client.guildConfig.get(guild.id);
    let madeCase = false;
    if (cached.settings.moduleFlags.moderation) {
      await guardAgainstNuke(client, entry, guild, cached.settings);
      // after the nuke check and behind its own guard: a failure here must stop neither that check nor the log below
      madeCase = await recordAuditCase(client, entry, guild, cached).catch((err) => {
        logger.warn({ err, guildId: guild.id, entryId: entry.id }, "audit case failed");
        return false;
      });
    }
    // the case just posted says who did what: don't repeat it as a server-log line in the same channel
    const sameChannel = madeCase && streamChannelId(cached.settings, "server") === cached.settings.logChannelId;
    if (cached.settings.moduleFlags.community && !sameChannel) await logServerAction(client, entry, guild, cached.settings);
  },
};
