// /quarantine: hide the whole server from a member while the moderators decide, in place of most bans.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { eq } from "drizzle-orm";
import { quarantines } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { isQuarantined } from "../../../lib/role-guard.js";
import { parseDuration } from "../lib/duration.js";
import { QuarantineError, quarantineMember, quarantineRefusal, releaseMember, setupQuarantine } from "../lib/quarantine.js";

const LOADING = "The settings are still loading. Try again in a moment.";

export const quarantineCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("quarantine")
    .setDescription("Hide the whole server from a member while the moderators decide")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Quarantine a member: their roles are remembered and the server is hidden from them")
        .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason (the member is told)").setRequired(true).setMaxLength(500))
        .addStringOption((o) => o.setName("length").setDescription("30m, 12h, 3d… up to 28d. Empty: until a moderator lifts it").setRequired(false).setMaxLength(8))
        .addStringOption((o) => o.setName("evidence").setDescription("A message link, an image link, or a short note").setRequired(false).setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s
        .setName("release")
        .setDescription("Lift a quarantine: the member's roles come back")
        .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false).setMaxLength(500)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Who is quarantined now"))
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Make or repair the Quarantined role and the appeal channel (needs Manage Server)")
        .addChannelOption((o) =>
          o.setName("review_channel").setDescription("A private staff channel where appeals will be posted").addChannelTypes(ChannelType.GuildText).setRequired(false),
        ),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === "setup") {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: "You need Manage Server to set quarantine up.", ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const review = interaction.options.getChannel("review_channel");
        const done = await setupQuarantine(ctx.client, guild, { reviewChannelId: review ? review.id : undefined });
        const lines = [
          `${done.madeRole ? "Made" : "Found"} the role ${done.role}, and ${done.madeChannel ? "made" : "found"} ${done.appeal}.`,
          `Hidden from the role now: ${done.hidden} more of ${done.total} channels${done.failed.length ? "" : " (all of them are covered)"}.`,
        ];
        if (done.failed.length) {
          lines.push(`I couldn't edit ${done.failed.length}: ${done.failed.slice(0, 15).map((id) => `<#${id}>`).join(", ")}. Give me Manage Permissions there and run the set-up again.`);
        }
        lines.push("Use `/quarantine add` to put someone in. Running the set-up again is safe: it only adds what is missing.");
        await interaction.editReply({ content: lines.join("\n") });
        return;
      }

      if (sub === "list") {
        const rows = await ctx.client.db.select().from(quarantines).where(eq(quarantines.guildId, guild.id));
        const text = rows.length
          ? rows
              .map((row) => `<@${row.userId}>${row.caseNumber ? ` · case #${row.caseNumber}` : ""} · ${row.until ? `until <t:${Math.floor(row.until.getTime() / 1000)}:f>` : "until a moderator lifts it"}`)
              .join("\n")
              .slice(0, 3900)
          : "Nobody is quarantined.";
        await interaction.reply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle("Quarantine").setDescription(text)], ephemeral: true });
        return;
      }

      const cached = await ctx.client.guildConfig.get(guild.id);
      if (cached.degraded) {
        await interaction.reply({ content: LOADING, ephemeral: true });
        return;
      }
      const user = interaction.options.getUser("member", true);

      if (sub === "release") {
        await interaction.deferReply({ ephemeral: true });
        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const done = await releaseMember(ctx.client, guild, user.id, { moderator: interaction.user, reason, settings: cached.settings });
        if (!done.ok) {
          await interaction.editReply({ content: `${user.tag} isn't quarantined.` });
          return;
        }
        const notes = [
          done.left ? "They have left the server: they won't be quarantined when they come back." : "Their roles are back.",
          done.lost.length ? `Not given back (deleted, or above what I may give): ${done.lost.join(", ")}.` : "",
        ].filter(Boolean);
        await interaction.editReply({ content: `${user.tag} is out of quarantine · case #${done.caseNumber}. ${notes.join(" ")}` });
        return;
      }

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "They aren't in this server.", ephemeral: true });
        return;
      }
      const moderator = await guild.members.fetch(interaction.user.id);
      const refusal = quarantineRefusal(moderator, member, cached.settings);
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
      if (isQuarantined(guild.id, member.id)) {
        await interaction.reply({ content: `${user.tag} is already quarantined. Use \`/quarantine release\` to lift it.`, ephemeral: true });
        return;
      }
      const lengthText = interaction.options.getString("length");
      const ms = lengthText ? parseDuration(lengthText) : null;
      if (lengthText && ms === null) {
        await interaction.reply({ content: "I couldn't read that length. Use 30m, 12h or 3d (up to 28d), or leave it empty.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const done = await quarantineMember(ctx.client, guild, member, {
        moderator: interaction.user,
        reason: interaction.options.getString("reason", true),
        ms,
        evidence: interaction.options.getString("evidence"),
        settings: cached.settings,
      });
      const lines = [
        `🔒 ${user.tag} is quarantined · case #${done.caseNumber} · ${done.until ? `until <t:${Math.floor(done.until.getTime() / 1000)}:f>` : "until a moderator lifts it"}.`,
        done.told ? "They were told by DM." : `Their DMs are closed, so they were not told${done.appealChannelId ? `; they can read <#${done.appealChannelId}>` : ""}.`,
      ];
      if (done.stillSees.length) {
        lines.push(`They can still see ${done.stillSees.slice(0, 15).map((id) => `<#${id}>`).join(", ")}: access given to them in person, or to a role they keep, beats the Quarantined role.`);
      }
      await interaction.editReply({ content: lines.join("\n") });
    } catch (error) {
      if (!(error instanceof QuarantineError)) throw error;
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: error.message });
      else await interaction.reply({ content: error.message, ephemeral: true });
    }
  },
};
