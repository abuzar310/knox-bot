import { ActionRowBuilder, ChannelType, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, type Role } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { roleGrantProblem } from "../../../lib/roles.js";
import { ROLE_MENU_ID } from "../lib/role-menu.js";

const MAX_ROLES = 10;

export const roleMenuCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: (() => {
    const b = new SlashCommandBuilder()
      .setName("rolemenu")
      .setDescription("Post a dropdown members use to pick their own roles")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption((o) => o.setName("title").setDescription("Heading above the menu").setRequired(true).setMaxLength(100))
      .addRoleOption((o) => o.setName("role1").setDescription("A role to offer").setRequired(true))
      .addRoleOption((o) => o.setName("role2").setDescription("Another role").setRequired(true));
    for (let i = 3; i <= MAX_ROLES; i++) b.addRoleOption((o) => o.setName(`role${i}`).setDescription("Another role"));
    return b
      .addIntegerOption((o) => o.setName("max_picks").setDescription("How many a member may hold at once (default: all)").setMinValue(1).setMaxValue(MAX_ROLES))
      .addStringOption((o) => o.setName("description").setDescription("A line under the heading").setMaxLength(300))
      .addChannelOption((o) => o.setName("channel").setDescription("Where to post (default: here)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement));
  })(),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const roles: Role[] = [];
    for (let i = 1; i <= MAX_ROLES; i++) {
      const picked = interaction.options.getRole(`role${i}`);
      if (!picked) continue;
      const role = guild.roles.cache.get(picked.id);
      if (!role) continue;
      const problem = roleGrantProblem(role);
      if (problem) {
        await interaction.reply({ content: `${role.name} can't be offered: ${problem}.`, ephemeral: true });
        return;
      }
      if (!roles.some((r) => r.id === role.id)) roles.push(role);
    }
    if (roles.length < 2) {
      await interaction.reply({ content: "Offer at least two different roles.", ephemeral: true });
      return;
    }
    const channelId = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
    const channel = guild.channels.cache.get(channelId);
    const me = guild.members.me;
    if (!channel || !me || !channel.isTextBased() || channel.isThread() || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply({ content: "I can't post in that channel.", ephemeral: true });
      return;
    }
    const maxPicks = Math.min(roles.length, interaction.options.getInteger("max_picks") ?? roles.length);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(ROLE_MENU_ID)
      .setPlaceholder(maxPicks === 1 ? "Pick a role" : `Pick up to ${maxPicks} roles`)
      .setMinValues(0)
      .setMaxValues(maxPicks)
      .addOptions(roles.map((r) => ({ label: r.name.slice(0, 100), value: r.id })));
    const embed = knoxEmbed(ctx.settings?.embedColor).setTitle(interaction.options.getString("title", true));
    const description = interaction.options.getString("description");
    embed.setDescription(`${description ? `${description}\n\n` : ""}${roles.map((r) => `<@&${r.id}>`).join(" · ")}\n\nPick from the menu; clearing it removes the roles again.`);
    await channel.send({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], allowedMentions: { parse: [] } });
    await interaction.reply({ content: `Role menu posted in <#${channel.id}>.`, ephemeral: true });
  },
};
