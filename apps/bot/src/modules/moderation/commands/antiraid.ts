// Settings for the join gate, automatic raid mode and anti-phishing (also editable on the dashboard).
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { phishListSize } from "../../../lib/safety/phish-list.js";
import { aiProvider } from "../../../lib/ai-moderation.js";

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
    )
    .addSubcommand((s) =>
      s
        .setName("ai")
        .setDescription("AI moderation: threats, harassment, hate and worse are removed; borderline messages are logged")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("antinuke")
        .setDescription("Stop a hacked or rogue admin from mass-deleting channels/roles, mass-banning or spamming webhooks")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("What ZARU does to whoever trips it (default: strip their roles)")
            .addChoices({ name: "Strip their roles", value: "strip" }, { name: "Kick them", value: "kick" }, { name: "Ban them", value: "ban" }),
        )
        .addUserOption((o) => o.setName("trust").setDescription("Always allow this person (never stop them)"))
        .addUserOption((o) => o.setName("untrust").setDescription("Remove this person from the trusted list")),
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
          { name: "AI moderation", value: mod.aiModeration ? `on (${aiProvider() ?? "no key!"})` : aiProvider() ? "off (/antiraid ai)" : "off · no API key on the host", inline: true },
          { name: "Anti-nuke", value: mod.antiNuke ? `on · ${mod.antiNukeAction === "ban" ? "bans" : mod.antiNukeAction === "kick" ? "kicks" : "strips roles of"} runaway admins${mod.antiNukeWhitelist.length ? ` · ${mod.antiNukeWhitelist.length} trusted` : ""}` : "off (/antiraid antinuke)", inline: true },
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
    } else if (sub === "ai") {
      const wanted = interaction.options.getBoolean("enabled", true);
      if (wanted && !aiProvider()) {
        await interaction.reply({ content: "AI moderation needs an API key on the ZARU host: OPENAI_API_KEY (its moderation endpoint is free to call), GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY. Add one to the env file and restart ZARU.", ephemeral: true });
        return;
      }
      next.aiModeration = wanted;
      said = wanted
        ? `AI moderation is on (${aiProvider() === "openai" ? "OpenAI moderation" : aiProvider() === "gemini" ? "Gemini" : "Claude"}): clear threats, harassment, hate, sexual content involving minors and self-harm instructions are deleted with a 10-minute timeout; borderline messages are written to the log channel for a human look. Staff with Manage Messages are never checked.`
        : "AI moderation is off.";
    } else if (sub === "antinuke") {
      next.antiNuke = interaction.options.getBoolean("enabled", true);
      const action = interaction.options.getString("action");
      if (action === "strip" || action === "kick" || action === "ban") next.antiNukeAction = action;
      const trust = interaction.options.getUser("trust");
      const untrust = interaction.options.getUser("untrust");
      if (trust && !next.antiNukeWhitelist.includes(trust.id)) next.antiNukeWhitelist = [...next.antiNukeWhitelist, trust.id].slice(0, 50);
      if (untrust) next.antiNukeWhitelist = next.antiNukeWhitelist.filter((id) => id !== untrust.id);
      const verb = next.antiNukeAction === "ban" ? "ban them" : next.antiNukeAction === "kick" ? "kick them" : "strip all their roles";
      said = next.antiNuke
        ? `Anti-nuke is on. If anyone other than you${next.antiNukeWhitelist.length ? ` and ${next.antiNukeWhitelist.length} trusted account(s)` : ""} deletes ~4 channels or roles, bans ~5 people, or makes ~3 webhooks within a minute, ZARU will ${verb} and ping you. Note: ZARU can only stop people whose top role is below its own, so keep its role near the top.`
        : "Anti-nuke is off.";
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
