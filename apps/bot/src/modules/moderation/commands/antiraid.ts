// Settings for the join gate, automatic raid mode and anti-phishing (also editable on the dashboard).
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { phishListSize } from "../../../lib/safety/phish-list.js";

export const antiraidCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Join gate, automatic raid mode and anti-phishing settings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("view").setDescription("Current protection settings"))
    .addSubcommand((s) =>
      s
        .setName("joingate")
        .setDescription("Turn away too-new accounts or members without an avatar")
        .addIntegerOption((o) => o.setName("min_account_age").setDescription("Minimum account age in hours (0 = off)").setMinValue(0).setMaxValue(8760))
        .addBooleanOption((o) => o.setName("require_avatar").setDescription("Turn away members with no profile picture")),
    )
    .addSubcommand((s) =>
      s
        .setName("threshold")
        .setDescription("Switch raid mode on by itself at this many joins per minute")
        .addIntegerOption((o) => o.setName("joins_per_minute").setDescription("Joins within one minute (0 = off; 10 is a sane start)").setMinValue(0).setMaxValue(500).setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("phishing")
        .setDescription("Delete and time out messages with known scam or look-alike links")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const mod = cached.settings.moderation;
    const sub = interaction.options.getSubcommand();

    if (sub === "view") {
      const embed = knoxEmbed(cached.settings.embedColor)
        .setTitle("Protection")
        .addFields(
          { name: "Minimum account age", value: mod.joinGateMinAccountAgeHours > 0 ? `${mod.joinGateMinAccountAgeHours} h` : "off", inline: true },
          { name: "Avatar required", value: mod.joinGateRequireAvatar ? "yes" : "no", inline: true },
          { name: "Auto raid mode", value: mod.raidJoinsPerMinute > 0 ? `${mod.raidJoinsPerMinute} joins/min` : "off", inline: true },
          { name: "Raid mode now", value: mod.raidMode ? "ON" : "off", inline: true },
          { name: "Anti-phishing", value: mod.antiPhishing ? `on · ${phishListSize().toLocaleString()} known scam domains loaded` : "off", inline: true },
        )
        .setFooter({ text: "Turned-away members get a DM saying why; every action is written to the log channel." });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const next = { ...mod };
    let said: string;
    if (sub === "joingate") {
      const age = interaction.options.getInteger("min_account_age");
      const avatar = interaction.options.getBoolean("require_avatar");
      if (age === null && avatar === null) {
        await interaction.reply({ content: "Give min_account_age, require_avatar, or both.", ephemeral: true });
        return;
      }
      if (age !== null) next.joinGateMinAccountAgeHours = age;
      if (avatar !== null) next.joinGateRequireAvatar = avatar;
      said =
        `Join gate: minimum account age ${next.joinGateMinAccountAgeHours > 0 ? `${next.joinGateMinAccountAgeHours} h` : "off"}, ` +
        `avatar ${next.joinGateRequireAvatar ? "required" : "not required"}. Members who don't pass get a DM and are kicked.`;
    } else if (sub === "threshold") {
      next.raidJoinsPerMinute = interaction.options.getInteger("joins_per_minute", true);
      said =
        next.raidJoinsPerMinute > 0
          ? `Raid mode switches on by itself at ${next.raidJoinsPerMinute} joins within a minute, for 30 minutes, and the owner is told.`
          : "Automatic raid mode is off; /raidmode on still works by hand.";
    } else {
      next.antiPhishing = interaction.options.getBoolean("enabled", true);
      said = next.antiPhishing
        ? "Anti-phishing is on: messages linking to known scam domains or fake Discord/Nitro/Steam sites are deleted and the sender is timed out for 10 minutes."
        : "Anti-phishing is off.";
    }
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: next });
    await interaction.reply({ content: said, ephemeral: true });
  },
};
