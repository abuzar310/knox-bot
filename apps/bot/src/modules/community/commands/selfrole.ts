// Emoji self-roles: post a message, attach emoji → role, pick a mode.
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";
import type { EmojiRoleMode } from "../../../lib/emoji-role-plan.js";

const MODES: EmojiRoleMode[] = ["toggle", "unique", "verify", "reversed", "binding", "temporary"];

export const selfRoleCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("selfrole")
    .setDescription("Emoji self-roles: toggle, unique, verify, reversed, binding, or temporary")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("post")
        .setDescription("Post a message people react to")
        .addStringOption((o) => o.setName("title").setDescription("Title").setRequired(true).setMaxLength(80))
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("How reactions behave")
            .setRequired(true)
            .addChoices(
              { name: "Toggle", value: "toggle" },
              { name: "Unique", value: "unique" },
              { name: "Verify", value: "verify" },
              { name: "Reversed", value: "reversed" },
              { name: "Binding", value: "binding" },
              { name: "Temporary", value: "temporary" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Attach an emoji and a role to a message")
        .addStringOption((o) => o.setName("message").setDescription("Message id").setRequired(true))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji, or <:name:id>").setRequired(true).setMaxLength(64))
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("mode")
        .setDescription("Change the mode, a required role, or how long a temporary role lasts")
        .addStringOption((o) => o.setName("message").setDescription("Message id").setRequired(true))
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Mode")
            .addChoices(
              { name: "Toggle", value: "toggle" },
              { name: "Unique", value: "unique" },
              { name: "Verify", value: "verify" },
              { name: "Reversed", value: "reversed" },
              { name: "Binding", value: "binding" },
              { name: "Temporary", value: "temporary" },
            ),
        )
        .addRoleOption((o) => o.setName("requires").setDescription("Role a member must already have (binding)"))
        .addIntegerOption((o) => o.setName("minutes").setDescription("How long a temporary role lasts").setMinValue(1).setMaxValue(43200)),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const sub = interaction.options.getSubcommand();
    const features = ctx.settings.features;
    const panels = features.emojiRolePanels;

    if (sub === "post") {
      if (panels.length >= 15) {
        await interaction.reply({ content: "This server already has 15 reaction-role messages.", ephemeral: true });
        return;
      }
      const title = interaction.options.getString("title", true);
      const mode = interaction.options.getString("mode", true) as EmojiRoleMode;
      await interaction.reply({
        embeds: [knoxEmbed(ctx.settings.embedColor).setTitle(title).setDescription(`React to pick a role. Mode: **${mode}**.`)],
      });
      const msg = await interaction.fetchReply();
      await persistGuildSettings(ctx.client, interaction.guild.id, {
        ...ctx.settings,
        features: {
          ...features,
          emojiRolePanels: [
            ...panels,
            { messageId: msg.id, channelId: interaction.channelId, mode, durationMinutes: mode === "temporary" ? 60 : null, requiredRoleId: null, pairs: [] },
          ],
        },
      });
      return;
    }

    const messageId = interaction.options.getString("message", true).trim();
    const panel = panels.find((row) => row.messageId === messageId);
    if (!panel) {
      await interaction.reply({ content: "That message isn't a self-role panel. Post one with `/selfrole post`.", ephemeral: true });
      return;
    }

    if (sub === "mode") {
      const mode = (interaction.options.getString("mode") as EmojiRoleMode | null) ?? panel.mode;
      if (!MODES.includes(mode)) {
        await interaction.reply({ content: "Unknown mode.", ephemeral: true });
        return;
      }
      const requires = interaction.options.getRole("requires");
      const minutes = interaction.options.getInteger("minutes");
      const next = panels.map((row) =>
        row.messageId === messageId
          ? {
              ...row,
              mode,
              requiredRoleId: requires ? requires.id : row.requiredRoleId,
              durationMinutes: minutes ?? row.durationMinutes,
            }
          : row,
      );
      await persistGuildSettings(ctx.client, interaction.guild.id, { ...ctx.settings, features: { ...features, emojiRolePanels: next } });
      await interaction.reply({ content: `That message is now **${mode}**.`, ephemeral: true });
      return;
    }

    const emoji = interaction.options.getString("emoji", true).trim();
    const role = interaction.options.getRole("role", true);
    const problem = await roleIdGrantProblem(interaction.guild, role.id);
    if (problem) {
      await interaction.reply({ content: `Can't use that role: ${problem}.`, ephemeral: true });
      return;
    }
    if (panel.pairs.length >= 20) {
      await interaction.reply({ content: "That message already has 20 roles.", ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(panel.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: "The panel channel is gone.", ephemeral: true });
      return;
    }
    const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (!msg) {
      await interaction.reply({ content: "That message is gone.", ephemeral: true });
      return;
    }
    const reacted = await msg.react(emoji).then(() => true, () => false);
    if (!reacted) {
      await interaction.reply({ content: "I couldn't react with that emoji. Use one from this server, or a normal emoji.", ephemeral: true });
      return;
    }
    const pairs = [...panel.pairs.filter((pair) => pair.roleId !== role.id && pair.emoji !== emoji), { emoji, roleId: role.id }];
    const lines = pairs.map((pair) => `${pair.emoji} <@&${pair.roleId}>`).join("\n");
    await msg.edit({ embeds: [knoxEmbed(ctx.settings.embedColor).setTitle(msg.embeds[0]?.title ?? "Roles").setDescription(`${panel.mode}\n\n${lines}`)] }).catch(() => undefined);
    const next = panels.map((row) => (row.messageId === messageId ? { ...row, pairs } : row));
    await persistGuildSettings(ctx.client, interaction.guild.id, { ...ctx.settings, features: { ...features, emojiRolePanels: next } });
    await interaction.reply({ content: `${emoji} gives ${role}.`, ephemeral: true });
  },
};
