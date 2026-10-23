// Discord's own AutoMod rules, created the way /automod setup and /setup auto want them.
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  type AutoModerationActionOptions,
  type AutoModerationRule,
  type Guild,
} from "discord.js";
import type { GuildSettings } from "@knox/config";
import type { PermissionRoleRow } from "../../../types.js";

export const AUTOMOD_PREFIX = "ZARU · ";

export type NativeAutomodOptions = { wordLists: boolean; mentionLimit: number; timeoutMinutes: number; spam: boolean };

export async function removeZaruRules(guild: Guild) {
  const rules = await guild.autoModerationRules.fetch();
  let removed = 0;
  for (const rule of rules.values()) {
    if (rule.name.startsWith(AUTOMOD_PREFIX)) {
      await rule.delete("Replaced by ZARU").catch(() => undefined);
      removed++;
    }
  }
  return removed;
}

/** creates the rules and returns one line per rule (✅ / ⚠️ / ❌) */
export async function setupNativeAutomod(
  guild: Guild,
  settings: GuildSettings,
  permissionRows: PermissionRoleRow[],
  actorTag: string,
  options: NativeAutomodOptions,
): Promise<{ lines: string[]; alerts: boolean }> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  await removeZaruRules(guild);
  const exemptRoles = permissionRows.filter((r) => r.rank === "admin" || r.rank === "mod").map((r) => r.roleId).filter((id) => guild.roles.cache.has(id));
  const logChannel = settings.logChannelId ? guild.channels.cache.get(settings.logChannelId) : null;
  const alert: AutoModerationActionOptions[] =
    logChannel && logChannel.isTextBased() && !logChannel.isThread() ? [{ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannel.id } }] : [];
  const block = (customMessage: string): AutoModerationActionOptions => ({ type: AutoModerationActionType.BlockMessage, metadata: { customMessage } });
  const lines: string[] = [];
  const attempt = async (label: string, create: () => Promise<AutoModerationRule>) => {
    try {
      const rule = await create();
      lines.push(`✅ **${rule.name}**`);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      lines.push(/maximum number/i.test(text) ? `⚠️ ${label}: this server already has a rule of that kind (made in Server Settings), so it was left alone.` : `❌ ${label}: ${text.slice(0, 120)}`);
    }
  };
  const reason = `ZARU setup by ${actorTag}`;
  if (options.wordLists) {
    await attempt("Word lists", () =>
      guild.autoModerationRules.create({
        name: `${AUTOMOD_PREFIX}Profanity, sexual content & slurs`,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.KeywordPreset,
        triggerMetadata: { presets: [AutoModerationRuleKeywordPresetType.Profanity, AutoModerationRuleKeywordPresetType.SexualContent, AutoModerationRuleKeywordPresetType.Slurs] },
        actions: [block("That word isn't allowed in this server."), ...alert],
        exemptRoles,
        enabled: true,
        reason,
      }),
    );
  }
  if (options.mentionLimit > 0) {
    const timeout: AutoModerationActionOptions[] =
      options.timeoutMinutes > 0 && me.permissions.has(PermissionFlagsBits.ModerateMembers)
        ? [{ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: options.timeoutMinutes * 60 } }]
        : [];
    await attempt("Mention spam", () =>
      guild.autoModerationRules.create({
        name: `${AUTOMOD_PREFIX}Mention spam (more than ${options.mentionLimit})`,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.MentionSpam,
        triggerMetadata: { mentionTotalLimit: options.mentionLimit, mentionRaidProtectionEnabled: true },
        actions: [block(`Please don't mention more than ${options.mentionLimit} people at once.`), ...timeout, ...alert],
        exemptRoles,
        enabled: true,
        reason,
      }),
    );
  }
  if (options.spam) {
    await attempt("Spam", () =>
      guild.autoModerationRules.create({
        name: `${AUTOMOD_PREFIX}Spam`,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Spam,
        actions: [block("That message looks like spam."), ...alert],
        exemptRoles,
        enabled: true,
        reason,
      }),
    );
  }
  return { lines, alerts: alert.length > 0 };
}
