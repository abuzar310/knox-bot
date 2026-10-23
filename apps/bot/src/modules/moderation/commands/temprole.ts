// /temprole: a role for a while (event access, trial staff, a punishment role), taken back on time.
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, asc, eq } from "drizzle-orm";
import { tempRoles } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";
import { formatDuration, parseDuration } from "../lib/duration.js";
import { logLine } from "../lib/modlog.js";

const MIN_MS = 60_000;
const MAX_MS = 365 * 24 * 60 * 60_000;

export const temproleCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("temprole")
    .setDescription("Give a role for a while; ZARU takes it back when the time is up")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Give a temporary role")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("The role").setRequired(true))
        .addStringOption((o) => o.setName("duration").setDescription("How long, e.g. 2h, 3d, 1w").setRequired(true).setMaxLength(20))
        .addStringOption((o) => o.setName("reason").setDescription("Why").setMaxLength(200)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Take a temporary role back now")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("The role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("Temporary roles running now")
        .addUserOption((o) => o.setName("user").setDescription("Only this member")),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const sub = interaction.options.getSubcommand();
    const cached = await client.guildConfig.get(guild.id);

    if (sub === "list") {
      const user = interaction.options.getUser("user");
      const rows = await client.db
        .select()
        .from(tempRoles)
        .where(user ? and(eq(tempRoles.guildId, guild.id), eq(tempRoles.userId, user.id)) : eq(tempRoles.guildId, guild.id))
        .orderBy(asc(tempRoles.expiresAt))
        .limit(25);
      if (!rows.length) {
        await interaction.reply({ content: "No temporary roles running.", ephemeral: true });
        return;
      }
      const lines = rows.map((r) => `<@${r.userId}> · <@&${r.roleId}> · ends <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>${r.reason ? ` · ${r.reason}` : ""}`);
      await interaction.reply({ embeds: [knoxEmbed(cached.settings.embedColor).setTitle("Temporary roles").setDescription(lines.join("\n").slice(0, 4000))], ephemeral: true });
      return;
    }

    const user = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "That person isn't in the server.", ephemeral: true });
      return;
    }
    if (sub === "remove") {
      const removed = await client.db
        .delete(tempRoles)
        .where(and(eq(tempRoles.guildId, guild.id), eq(tempRoles.userId, user.id), eq(tempRoles.roleId, role.id)))
        .returning({ id: tempRoles.id });
      if (member.roles.cache.has(role.id)) await member.roles.remove(role.id, `Temporary role removed by ${interaction.user.tag}`).catch(() => undefined);
      await interaction.reply({ content: removed.length ? `Took <@&${role.id}> back from ${user.username}.` : `${user.username} had no temporary <@&${role.id}>; the role was removed anyway if they had it.`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }

    const problem = await roleIdGrantProblem(guild, role.id);
    if (problem) {
      await interaction.reply({ content: `I can't give that role: ${problem}.`, ephemeral: true });
      return;
    }
    const ms = parseDuration(interaction.options.getString("duration", true));
    if (!ms || ms < MIN_MS || ms > MAX_MS) {
      await interaction.reply({ content: "Give a duration between 1 minute and 1 year, like 30m, 2h, 3d or 1w.", ephemeral: true });
      return;
    }
    const reason = interaction.options.getString("reason")?.trim() || null;
    const expiresAt = new Date(Date.now() + ms);
    await member.roles.add(role.id, `Temporary role (${formatDuration(ms)}) by ${interaction.user.tag}${reason ? `: ${reason}` : ""}`);
    await client.db
      .insert(tempRoles)
      .values({ guildId: guild.id, userId: user.id, roleId: role.id, expiresAt, grantedBy: interaction.user.id, reason })
      .onConflictDoUpdate({ target: [tempRoles.guildId, tempRoles.userId, tempRoles.roleId], set: { expiresAt, grantedBy: interaction.user.id, reason } });
    const stamp = Math.floor(expiresAt.getTime() / 1000);
    await logLine(guild, cached.settings, "Temporary role", `<@${user.id}> got <@&${role.id}> for ${formatDuration(ms)} (until <t:${stamp}:f>) from ${interaction.user.tag}${reason ? ` · ${reason}` : ""}`);
    await interaction.reply({ content: `${user.username} has <@&${role.id}> until <t:${stamp}:f> (<t:${stamp}:R>).`, ephemeral: true, allowedMentions: { parse: [] } });
  },
};
