// Discord's own AutoMod, set up in one command: the built-in word lists, a mention-spam limit and the spam filter.
// Native rules run inside Discord, before a message is even posted, so they don't depend on the bot being online.
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutoModerationActionOptions,
  type AutoModerationRule,
  type Guild,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";

const PREFIX = "ZARU · ";
const TRIGGER_LABEL: Record<number, string> = {
  [AutoModerationRuleTriggerType.Keyword]: "keywords",
  [AutoModerationRuleTriggerType.Spam]: "spam",
  [AutoModerationRuleTriggerType.KeywordPreset]: "word lists",
  [AutoModerationRuleTriggerType.MentionSpam]: "mention spam",
  [AutoModerationRuleTriggerType.MemberProfile]: "member profiles",
};

async function removeOurs(guild: Guild) {
  const rules = await guild.autoModerationRules.fetch();
  let removed = 0;
  for (const rule of rules.values()) {
    if (rule.name.startsWith(PREFIX)) {
      await rule.delete("Replaced by /automod setup").catch(() => undefined);
      removed++;
    }
  }
  return removed;
}

export const automodCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Set up Discord's built-in AutoMod rules in one go")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Create ZARU's AutoMod rules (replaces ones it made before)")
        .addBooleanOption((o) => o.setName("word_lists").setDescription("Block profanity, sexual content and slurs (Discord's lists); default on"))
        .addIntegerOption((o) => o.setName("mention_limit").setDescription("Block messages mentioning more than this many people/roles (0 = off; default 5)").setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName("timeout_minutes").setDescription("Time out mention spammers for this long (0 = don't; default 10)").setMinValue(0).setMaxValue(60))
        .addBooleanOption((o) => o.setName("spam").setDescription("Block messages Discord flags as spam; default on")),
    )
    .addSubcommand((s) => s.setName("rules").setDescription("List this server's AutoMod rules"))
    .addSubcommand((s) => s.setName("clear").setDescription("Delete the AutoMod rules ZARU created")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "I need the **Manage Server** permission to read or change AutoMod rules.", ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    const cached = await ctx.client.guildConfig.get(guild.id);

    if (sub === "rules") {
      const rules = await guild.autoModerationRules.fetch();
      if (!rules.size) {
        await interaction.editReply("This server has no AutoMod rules yet. /automod setup creates a sensible set.");
        return;
      }
      const lines = [...rules.values()].map(
        (r: AutoModerationRule) => `${r.enabled ? "🟢" : "⚪"} **${r.name}** · ${TRIGGER_LABEL[r.triggerType] ?? "rule"}${r.name.startsWith(PREFIX) ? "" : " · made in Server Settings"}`,
      );
      await interaction.editReply({ embeds: [knoxEmbed(cached.settings.embedColor).setTitle(`AutoMod rules (${rules.size})`).setDescription(lines.join("\n").slice(0, 4000))] });
      return;
    }

    if (sub === "clear") {
      const removed = await removeOurs(guild);
      await interaction.editReply(removed ? `Removed ${removed} ZARU AutoMod rule${removed === 1 ? "" : "s"}. Rules made in Server Settings were left alone.` : "ZARU hadn't created any AutoMod rules here.");
      return;
    }

    const wordLists = interaction.options.getBoolean("word_lists") ?? true;
    const mentionLimit = interaction.options.getInteger("mention_limit") ?? 5;
    const timeoutMinutes = interaction.options.getInteger("timeout_minutes") ?? 10;
    const spam = interaction.options.getBoolean("spam") ?? true;

    await removeOurs(guild);
    const exemptRoles = cached.permissionRows.filter((r) => r.rank === "admin" || r.rank === "mod").map((r) => r.roleId).filter((id) => guild.roles.cache.has(id));
    const logChannel = cached.settings.logChannelId ? guild.channels.cache.get(cached.settings.logChannelId) : null;
    const alert: AutoModerationActionOptions[] =
      logChannel && logChannel.isTextBased() && !logChannel.isThread() ? [{ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannel.id } }] : [];
    const block = (customMessage: string): AutoModerationActionOptions => ({ type: AutoModerationActionType.BlockMessage, metadata: { customMessage } });

    const results: string[] = [];
    const attempt = async (label: string, create: () => Promise<AutoModerationRule>) => {
      try {
        const rule = await create();
        results.push(`✅ **${rule.name}**`);
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        results.push(
          /maximum number/i.test(text)
            ? `⚠️ ${label}: this server already has a rule of that kind (made in Server Settings), so I left it alone.`
            : `❌ ${label}: ${text.slice(0, 120)}`,
        );
      }
    };

    if (wordLists) {
      await attempt("Word lists", () =>
        guild.autoModerationRules.create({
          name: `${PREFIX}Profanity, sexual content & slurs`,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.KeywordPreset,
          triggerMetadata: {
            presets: [AutoModerationRuleKeywordPresetType.Profanity, AutoModerationRuleKeywordPresetType.SexualContent, AutoModerationRuleKeywordPresetType.Slurs],
          },
          actions: [block("That word isn't allowed in this server."), ...alert],
          exemptRoles,
          enabled: true,
          reason: `/automod setup by ${interaction.user.tag}`,
        }),
      );
    }
    if (mentionLimit > 0) {
      const timeout: AutoModerationActionOptions[] =
        timeoutMinutes > 0 && me.permissions.has(PermissionFlagsBits.ModerateMembers)
          ? [{ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: timeoutMinutes * 60 } }]
          : [];
      await attempt("Mention spam", () =>
        guild.autoModerationRules.create({
          name: `${PREFIX}Mention spam (more than ${mentionLimit})`,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.MentionSpam,
          triggerMetadata: { mentionTotalLimit: mentionLimit, mentionRaidProtectionEnabled: true },
          actions: [block(`Please don't mention more than ${mentionLimit} people at once.`), ...timeout, ...alert],
          exemptRoles,
          enabled: true,
          reason: `/automod setup by ${interaction.user.tag}`,
        }),
      );
    }
    if (spam) {
      await attempt("Spam", () =>
        guild.autoModerationRules.create({
          name: `${PREFIX}Spam`,
          eventType: AutoModerationRuleEventType.MessageSend,
          triggerType: AutoModerationRuleTriggerType.Spam,
          actions: [block("That message looks like spam."), ...alert],
          exemptRoles,
          enabled: true,
          reason: `/automod setup by ${interaction.user.tag}`,
        }),
      );
    }
    if (!results.length) {
      await interaction.editReply("Nothing to set up: every option was off.");
      return;
    }
    const notes = [
      alert.length ? `Alerts go to <#${cached.settings.logChannelId}>.` : "Set a log channel (/setup logs) and run this again to get alerts for blocked messages.",
      exemptRoles.length ? `Exempt: ${exemptRoles.map((id) => `<@&${id}>`).join(", ")}.` : "",
      "These rules live in Server Settings → AutoMod and work even when ZARU is offline.",
    ].filter(Boolean);
    await interaction.editReply({
      embeds: [knoxEmbed(cached.settings.embedColor).setTitle("AutoMod set up").setDescription(results.join("\n")).addFields({ name: "Notes", value: notes.join("\n").slice(0, 1024) })],
    });
  },
};
