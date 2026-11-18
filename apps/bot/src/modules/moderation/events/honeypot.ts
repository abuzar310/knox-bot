// The trap channel at work (rules in honeypot-kit.ts): whoever writes there is removed with their last day of
// messages and may rejoin; staff only lose the message.
import { Events, PermissionFlagsBits, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { createCase } from "../lib/cases.js";
import { TRAP_DELETE_SECONDS, TRAP_WINDOW_MS, accountAge, makeHandled, trapAction, trapExempt, trapReason } from "../lib/honeypot-kit.js";
import { logLine, sendModLog } from "../lib/modlog.js";

const handled = makeHandled(TRAP_WINDOW_MS);
const RED = 0xff5c5c;

export const honeypotEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    const guild = message.guild;
    if (!guild || !message.member) return;
    const client = message.client as KnoxClient;
    const me = client.user;
    if (!me || !client.guildConfig) return;
    const cached = client.guildConfig.peek(guild.id) ?? (await client.guildConfig.get(guild.id));
    // stand-in settings name no trap: nothing is done on them
    if (cached.degraded || !cached.settings.moduleFlags.moderation) return;
    const trapChannelId = cached.settings.moderation.honeypotChannelId;
    if (!trapChannelId || message.channelId !== trapChannelId) return;

    const member = message.member;
    const exempt = trapExempt({
      isStaff: member.permissions.has(PermissionFlagsBits.ManageMessages),
      isOwner: member.id === guild.ownerId,
      hasProtectedRole: cached.settings.features.protectedRoleIds.some((id) => member.roles.cache.has(id)),
    });
    const isBot = message.author.bot;
    const candidate = !isBot && !exempt;
    const action = trapAction({ trapChannelId, channelId: message.channelId, isBot, exempt, firstInWindow: candidate ? handled.claim(`${guild.id}:${member.id}`) : false });
    if (action === "ignore") return;
    if (action === "delete") {
      await message.delete().catch(() => undefined);
      return;
    }

    const reason = trapReason({ accountAge: accountAge(message.author.createdTimestamp, Date.now()), content: message.content });
    if (!member.bannable) {
      await message.delete().catch(() => undefined);
      await logLine(guild, cached.settings, "Trap channel", `${message.author.tag} wrote in <#${trapChannelId}> but I can't remove them: their role is above mine, or I lack Ban Members.`, RED);
      return;
    }
    try {
      await guild.members.ban(member.id, { deleteMessageSeconds: TRAP_DELETE_SECONDS, reason: "Wrote in the trap channel" });
    } catch (err) {
      logger.warn({ err, guildId: guild.id, userId: member.id }, "trap channel: ban failed");
      await message.delete().catch(() => undefined);
      await logLine(guild, cached.settings, "Trap channel", `${message.author.tag} wrote in <#${trapChannelId}> but the removal failed. Check that I have Ban Members.`, RED);
      return;
    }
    // lifted at once: this removes a spam account and its messages, it is not meant to keep a person out
    const lift = () =>
      guild.members.unban(member.id, "Trap channel: removed, may join again").then(
        () => true,
        () => false,
      );
    let lifted = await lift();
    if (!lifted) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      lifted = await lift();
    }

    const modCase = await createCase(client.db, { guildId: guild.id, type: "kick", targetId: member.id, moderatorId: me.id, reason, active: false }).catch((err) => {
      logger.warn({ err, guildId: guild.id }, "trap channel: case not written");
      return null;
    });
    if (modCase) {
      await sendModLog(guild, cached.settings, {
        title: "Trap channel: member removed",
        caseNumber: modCase.caseNumber,
        action: "removed (may rejoin)",
        target: message.author,
        moderator: me,
        reason,
        color: RED,
      }).catch(() => undefined);
    }
    if (!lifted) {
      await logLine(guild, cached.settings, "Trap channel", `I removed ${message.author.tag} but could not lift the ban. Run \`/unban ${member.id}\` so they can join again.`, RED);
    }
  },
};
