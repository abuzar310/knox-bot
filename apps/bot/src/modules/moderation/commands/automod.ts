// Discord's own AutoMod, set up in one command: the built-in word lists, a mention-spam limit and the spam filter.
// Native rules run inside Discord, before a message is even posted, so they don't depend on the bot being online.
import { AutoModerationRuleTriggerType, PermissionFlagsBits, SlashCommandBuilder, type AutoModerationRule } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { AUTOMOD_PREFIX, removeZaruRules, setupNativeAutomod } from "../lib/native-automod.js";

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
