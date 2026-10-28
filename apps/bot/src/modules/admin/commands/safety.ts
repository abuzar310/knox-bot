// One command for the three safety switches: protected roles, per-command allow/deny, and the coin log.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Guild } from "discord.js";
import { and, eq } from "drizzle-orm";
import { commandOverrides, guilds, notifyGuildConfig } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings, SettingsNotLoadedError } from "../../../config/save-settings.js";
import { grantBlocked, normalizeCommandName } from "../../../lib/safety-rules.js";
import type { KnoxClient } from "../../../client.js";

const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

async function rememberGuild(client: KnoxClient, guild: Guild) {
  await client.db
    .insert(guilds)
    .values({ id: guild.id, name: guild.name, icon: guild.icon, ownerId: guild.ownerId })
    .onConflictDoUpdate({
      target: guilds.id,
      set: { name: guild.name, icon: guild.icon, ownerId: guild.ownerId },
    });
}

async function writeOverride(
  client: KnoxClient,
  guild: Guild,
  commandName: string,
  allowType: "role" | "user",
  allowId: string,
  effect: "allow" | "deny" | null,
) {
  await rememberGuild(client, guild);
  await client.db
    .delete(commandOverrides)
    .where(
      and(
        eq(commandOverrides.guildId, guild.id),
        eq(commandOverrides.commandName, commandName),
        eq(commandOverrides.allowType, allowType),
        eq(commandOverrides.allowId, allowId),
      ),
    );
  if (effect) {
    await client.db.insert(commandOverrides).values({
      guildId: guild.id,
      commandName,
      allowType,
      allowId,
      effect,
    });
  }
  await notifyGuildConfig(client.pool, guild.id);
  client.guildConfig.invalidate(guild.id);
}

export const safetyCommand: KnoxCommand = {
  moduleId: "admin",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("safety")
    .setDescription("Protected roles, who may run a command, and the coin log")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup((group) =>
      group
        .setName("protect")
        .setDescription("Roles ZARU will not kick, ban, mute, or disconnect")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Protect a role")
            .addRoleOption((opt) => opt.setName("role").setDescription("Role").setRequired(true)),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Stop protecting a role")
            .addRoleOption((opt) => opt.setName("role").setDescription("Role").setRequired(true)),
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("Show protected roles")),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("access")
        .setDescription("Allow or deny one command for a role or member")
        .addSubcommand((sub) =>
          sub
            .setName("allow")
            .setDescription("Let this role or member run a command")
            .addStringOption((opt) => opt.setName("command").setDescription("Slash name, like kick").setRequired(true).setMaxLength(32))
            .addRoleOption((opt) => opt.setName("role").setDescription("Role"))
            .addUserOption((opt) => opt.setName("user").setDescription("Member")),
        )
        .addSubcommand((sub) =>
          sub
            .setName("deny")
            .setDescription("Block this role or member from a command")
            .addStringOption((opt) => opt.setName("command").setDescription("Slash name, like kick").setRequired(true).setMaxLength(32))
            .addRoleOption((opt) => opt.setName("role").setDescription("Role"))
            .addUserOption((opt) => opt.setName("user").setDescription("Member")),
        )
        .addSubcommand((sub) =>
          sub
            .setName("clear")
            .setDescription("Remove an allow or deny")
            .addStringOption((opt) => opt.setName("command").setDescription("Slash name, like kick").setRequired(true).setMaxLength(32))
            .addRoleOption((opt) => opt.setName("role").setDescription("Role"))
            .addUserOption((opt) => opt.setName("user").setDescription("Member")),
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("Show command allows and denies")),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("money-log")
        .setDescription("Where staff coin grants, pay, and rob are written")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Log those coin moves in a channel")
            .addChannelOption((opt) =>
              opt.setName("channel").setDescription("Text channel").addChannelTypes(...TEXT).setRequired(true),
            ),
        )
        .addSubcommand((sub) => sub.setName("off").setDescription("Stop the coin log"))
        .addSubcommand((sub) => sub.setName("show").setDescription("Which channel logs coins")),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const group = interaction.options.getSubcommandGroup(true);
    const sub = interaction.options.getSubcommand(true);
    const color = ctx.settings?.embedColor;

    if (group === "protect") {
      if (!ctx.settings) {
        await interaction.reply({ content: "ZARU is still loading this server. Try again in a few seconds.", ephemeral: true });
        return;
      }
      const current = [...ctx.settings.features.protectedRoleIds];
      if (sub === "list") {
        await interaction.reply({
          embeds: [
            knoxEmbed(color)
              .setTitle("Protected roles")
              .setDescription(current.length ? current.map((id) => `<@&${id}>`).join("\n") : "None yet. `/safety protect add`."),
          ],
          ephemeral: true,
          allowedMentions: { parse: [] },
        });
        return;
      }
      const role = interaction.options.getRole("role", true);
      if (role.id === guild.id) {
        await interaction.reply({ content: "Pick a real role, not @everyone.", ephemeral: true });
        return;
      }
      const next = sub === "add" ? (current.includes(role.id) ? current : [...current, role.id]) : current.filter((id) => id !== role.id);
      if (sub === "add" && next.length > 20) {
        await interaction.reply({ content: "Twenty protected roles is the limit. Remove one first.", ephemeral: true });
        return;
      }
      if (sub === "add" && current.includes(role.id)) {
        await interaction.reply({ content: `${role} is already protected.`, ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      if (sub === "remove" && next.length === current.length) {
        await interaction.reply({ content: `${role} was not protected.`, ephemeral: true, allowedMentions: { parse: [] } });
        return;
      }
      try {
        await persistGuildSettings(ctx.client, guild.id, {
          ...ctx.settings,
          features: { ...ctx.settings.features, protectedRoleIds: next },
        });
      } catch (error) {
        const content = error instanceof SettingsNotLoadedError ? error.message : "I couldn't save that.";
        await interaction.reply({ content, ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [
          knoxEmbed(color)
            .setTitle(sub === "add" ? "Role protected" : "Role unprotected")
            .setDescription(
              sub === "add"
                ? `${role} cannot be kicked, banned, muted, or disconnected by ZARU.`
                : `${role} can be moderated by ZARU again.`,
            ),
        ],
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (group === "money-log") {
      if (!ctx.settings) {
        await interaction.reply({ content: "ZARU is still loading this server. Try again in a few seconds.", ephemeral: true });
        return;
      }
      if (sub === "show") {
        const id = ctx.settings.features.moneyLogChannelId;
        await interaction.reply({
          content: id ? `Coin log: <#${id}>. Staff grants, pay, and rob go there. Slot spins do not.` : "No coin log yet. `/safety money-log set`.",
          ephemeral: true,
        });
        return;
      }
      const channelId = sub === "off" ? null : interaction.options.getChannel("channel", true).id;
      try {
        await persistGuildSettings(ctx.client, guild.id, {
          ...ctx.settings,
          features: { ...ctx.settings.features, moneyLogChannelId: channelId },
        });
      } catch (error) {
        const content = error instanceof SettingsNotLoadedError ? error.message : "I couldn't save that.";
        await interaction.reply({ content, ephemeral: true });
        return;
      }
      await interaction.reply({
        content: channelId
          ? `Coin log set to <#${channelId}>. I'll write staff grants, pay, and rob there.`
          : "Coin log is off.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "list") {
      const cached = await ctx.client.guildConfig.get(guild.id);
      const lines = cached.overrides.map((row) => {
        const who = row.allowType === "role" ? `<@&${row.allowId}>` : `<@${row.allowId}>`;
        return `**${row.effect}** \`/${row.commandName}\` for ${who}`;
      });
      await interaction.reply({
        embeds: [
          knoxEmbed(color)
            .setTitle("Command access")
            .setDescription(lines.length ? lines.join("\n").slice(0, 3900) : "None yet. `/safety access allow` or `deny`."),
        ],
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const commandName = normalizeCommandName(interaction.options.getString("command", true));
    const role = interaction.options.getRole("role");
    const user = interaction.options.getUser("user");
    if (!commandName || !ctx.client.commands.has(commandName)) {
      await interaction.reply({
        content: "I don't have that command. Use the name after the slash, like `kick` or `purge`.",
        ephemeral: true,
      });
      return;
    }
    if (!role && !user) {
      await interaction.reply({ content: "Pick a role or a member.", ephemeral: true });
      return;
    }
    if (sub === "allow" && grantBlocked(commandName)) {
      await interaction.reply({
        content: "I won't grant `/ban`, `/tempban`, `/safety`, or `/set-rank-role`. Those stay with admins.",
        ephemeral: true,
      });
      return;
    }
    const effect = sub === "clear" ? null : sub === "allow" ? "allow" : "deny";
    const targets: Array<{ type: "role" | "user"; id: string; label: string }> = [];
    if (role) {
      if (role.id === guild.id) {
        await interaction.reply({ content: "Pick a real role, not @everyone.", ephemeral: true });
        return;
      }
      targets.push({ type: "role", id: role.id, label: `${role}` });
    }
    if (user) targets.push({ type: "user", id: user.id, label: `${user}` });
    for (const target of targets) {
      await writeOverride(ctx.client, guild, commandName, target.type, target.id, effect);
    }
    const who = targets.map((t) => t.label).join(" and ");
    const verb = effect === "allow" ? "can run" : effect === "deny" ? "cannot run" : "no longer has a special rule for";
    await interaction.reply({
      embeds: [knoxEmbed(color).setTitle("Command access").setDescription(`${who} ${verb} \`/${commandName}\`.`)],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
