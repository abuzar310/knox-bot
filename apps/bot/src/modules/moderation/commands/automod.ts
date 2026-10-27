// Discord's own AutoMod, set up in one command: the built-in word lists, a mention-spam limit and the spam filter.
// Native rules run inside Discord, before a message is even posted, so they don't depend on the bot being online.
import { AutoModerationRuleTriggerType, PermissionFlagsBits, SlashCommandBuilder, type AutoModerationRule } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { AUTOMOD_PREFIX, removeZaruRules, setupNativeAutomod, syncBlockedWordsRule } from "../lib/native-automod.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { HINGLISH_ABUSE, normalizeWords } from "../../../lib/safety/blocked-words.js";

const TRIGGER_LABEL: Record<number, string> = {
  [AutoModerationRuleTriggerType.Keyword]: "keywords",
  [AutoModerationRuleTriggerType.Spam]: "spam",
  [AutoModerationRuleTriggerType.KeywordPreset]: "word lists",
  [AutoModerationRuleTriggerType.MentionSpam]: "mention spam",
  [AutoModerationRuleTriggerType.MemberProfile]: "member profiles",
};

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
    .addSubcommand((s) => s.setName("clear").setDescription("Delete the AutoMod rules ZARU created"))
    .addSubcommandGroup((g) =>
      g
        .setName("words")
        .setDescription("Words blocked outright (Hindi/Hinglish abuse by default); *word* also matches inside words")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Block words (comma-separated)")
            .addStringOption((o) => o.setName("words").setDescription("e.g. *gaali*, badword, *teri maa ki*").setRequired(true).setMaxLength(1000)),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Unblock words (comma-separated)")
            .addStringOption((o) => o.setName("words").setDescription("Exactly as listed").setRequired(true).setMaxLength(1000)),
        )
        .addSubcommand((s) => s.setName("list").setDescription("The blocked words"))
        .addSubcommand((s) => s.setName("reset").setDescription("Back to ZARU's default Hindi/Hinglish list"))
        .addSubcommand((s) => s.setName("clear").setDescription("Block nothing")),
    )
    .addSubcommand((s) =>
      s
        .setName("escalation")
        .setDescription("Auto-punish a member who piles up warns (no clicking needed)")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true))
        .addIntegerOption((o) => o.setName("mute_at").setDescription("Warns that trigger a timeout (0 = off)").setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName("mute_minutes").setDescription("Timeout length in minutes (default 60)").setMinValue(1).setMaxValue(40320))
        .addIntegerOption((o) => o.setName("kick_at").setDescription("Warns that trigger a kick (0 = off)").setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName("ban_at").setDescription("Warns that trigger a ban (0 = off)").setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName("window_days").setDescription("Only count warns from the last N days (default 30)").setMinValue(1).setMaxValue(365)),
    )
    .addSubcommand((s) =>
      s
        .setName("filters")
        .setDescription("Extra live message filters ZARU enforces (delete only, no timeout)")
        .addBooleanOption((o) => o.setName("caps").setDescription("Delete messages that are mostly CAPS"))
        .addBooleanOption((o) => o.setName("emoji").setDescription("Delete messages with 10+ emoji"))
        .addBooleanOption((o) => o.setName("repeat").setDescription("Delete repeated-character or repeated-word spam")),
    ),
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

    if (interaction.options.getSubcommandGroup(false) === "words") {
      const current = normalizeWords(cached.settings.moderation.blockedWords);
      if (sub === "list") {
        await interaction.editReply(current.length ? `Blocked (${current.length}): ${current.map((w) => `\`${w}\``).join(" ")}`.slice(0, 1900) : "No blocked words. /automod words reset installs the default Hindi/Hinglish list.");
        return;
      }
      const typed = interaction.options.getString("words")?.split(",") ?? [];
      const next =
        sub === "reset" ? [...HINGLISH_ABUSE] : sub === "clear" ? [] : sub === "add" ? normalizeWords([...current, ...typed]) : current.filter((w) => !normalizeWords(typed).includes(w));
      const settings = await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...cached.settings.moderation, blockedWords: next } });
      const outcome = await syncBlockedWordsRule(guild, settings, cached.permissionRows, interaction.user.tag).catch((err) => `Saved, but Discord refused the rule: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`);
      await interaction.editReply(`${outcome} Messages with these words are blocked before they post; staff rank roles are exempt.`);
      return;
    }

    if (sub === "rules") {
      const rules = await guild.autoModerationRules.fetch();
      if (!rules.size) {
        await interaction.editReply("This server has no AutoMod rules yet. /automod setup creates a sensible set.");
        return;
      }
      const lines = [...rules.values()].map(
        (r: AutoModerationRule) => `${r.enabled ? "🟢" : "⚪"} **${r.name}** · ${TRIGGER_LABEL[r.triggerType] ?? "rule"}${r.name.startsWith(AUTOMOD_PREFIX) ? "" : " · made in Server Settings"}`,
      );
      await interaction.editReply({ embeds: [knoxEmbed(cached.settings.embedColor).setTitle(`AutoMod rules (${rules.size})`).setDescription(lines.join("\n").slice(0, 4000))] });
      return;
    }
    if (sub === "clear") {
      const removed = await removeZaruRules(guild);
      await interaction.editReply(removed ? `Removed ${removed} ZARU AutoMod rule${removed === 1 ? "" : "s"}. Rules made in Server Settings were left alone.` : "ZARU hadn't created any AutoMod rules here.");
      return;
    }

    if (sub === "escalation") {
      const mod = cached.settings.moderation;
      const next = {
        ...mod,
        warnEscalation: interaction.options.getBoolean("enabled", true),
        warnMuteAt: interaction.options.getInteger("mute_at") ?? mod.warnMuteAt,
        warnMuteMinutes: interaction.options.getInteger("mute_minutes") ?? mod.warnMuteMinutes,
        warnKickAt: interaction.options.getInteger("kick_at") ?? mod.warnKickAt,
        warnBanAt: interaction.options.getInteger("ban_at") ?? mod.warnBanAt,
        warnWindowDays: interaction.options.getInteger("window_days") ?? mod.warnWindowDays,
      };
      await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: next });
      const parts = [next.warnMuteAt > 0 ? `timeout at ${next.warnMuteAt} (${next.warnMuteMinutes}m)` : null, next.warnKickAt > 0 ? `kick at ${next.warnKickAt}` : null, next.warnBanAt > 0 ? `ban at ${next.warnBanAt}` : null].filter(Boolean);
      await interaction.editReply(next.warnEscalation ? `Warn escalation is on: ${parts.join(", ") || "no thresholds set — add mute_at/kick_at/ban_at"}, counting warns from the last ${next.warnWindowDays} days.` : "Warn escalation is off.");
      return;
    }

    if (sub === "filters") {
      const mod = cached.settings.moderation;
      const next = {
        ...mod,
        filterCaps: interaction.options.getBoolean("caps") ?? mod.filterCaps,
        filterEmoji: interaction.options.getBoolean("emoji") ?? mod.filterEmoji,
        filterRepeat: interaction.options.getBoolean("repeat") ?? mod.filterRepeat,
      };
      await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: next });
      await interaction.editReply(`Live filters — caps: **${next.filterCaps ? "on" : "off"}**, emoji spam: **${next.filterEmoji ? "on" : "off"}**, repeated text: **${next.filterRepeat ? "on" : "off"}**. These delete the message; staff with Manage Messages are never filtered.`);
      return;
    }

    const { lines, alerts } = await setupNativeAutomod(guild, cached.settings, cached.permissionRows, interaction.user.tag, {
      wordLists: interaction.options.getBoolean("word_lists") ?? true,
      mentionLimit: interaction.options.getInteger("mention_limit") ?? 5,
      timeoutMinutes: interaction.options.getInteger("timeout_minutes") ?? 10,
      spam: interaction.options.getBoolean("spam") ?? true,
    });
    if (!lines.length) {
      await interaction.editReply("Nothing to set up: every option was off.");
      return;
    }
    const notes = [
      alerts ? `Alerts go to <#${cached.settings.logChannelId}>.` : "Set a log channel (/setup logs) and run this again to get alerts for blocked messages.",
      "These rules live in Server Settings → AutoMod and work even when ZARU is offline.",
    ];
    await interaction.editReply({
      embeds: [knoxEmbed(cached.settings.embedColor).setTitle("AutoMod set up").setDescription(lines.join("\n")).addFields({ name: "Notes", value: notes.join("\n").slice(0, 1024) })],
    });
  },
};
