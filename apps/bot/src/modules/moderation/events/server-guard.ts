// One event powers two features: anti-nuke (stop a runaway admin/bot) and the server audit log (who did what).
import { Events, type Guild, type GuildAuditLogsEntry } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { guardAgainstNuke } from "../../../lib/anti-nuke.js";
import { logServerAction } from "../../../lib/audit-log.js";

export const serverGuardEvent: KnoxBoundEvent = {
  name: Events.GuildAuditLogEntryCreate,
  async execute(...args: unknown[]) {
    const entry = args[0] as GuildAuditLogsEntry;
    const guild = args[1] as Guild;
    if (!guild) return;
    const client = guild.client as KnoxClient;
    const cached = await client.guildConfig.get(guild.id);
    if (cached.settings.moduleFlags.moderation) await guardAgainstNuke(client, entry, guild, cached.settings);
    if (cached.settings.moduleFlags.community) await logServerAction(client, entry, guild, cached.settings);
  },
};
