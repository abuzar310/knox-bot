import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { ensureGuildSettings, persistGuildSettings } from "../../../config/save-settings.js";
import { DEFAULT_PREFIX, normalizePrefix } from "../../../lib/prefix.js";
import { resolveKnoxRank } from "../../../permissions/resolve.js";
import { hasMinRank } from "@knox/shared";

export const prefixCommand: KnoxCommand = {
  moduleId: "core",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("prefix")
    .setDescription("Show or change this server's text prefix (slash commands still work)")
    .addStringOption((o) =>
      o
        .setName("value")
        .setDescription("New prefix, like z! or ! — leave empty to show the current one")
        .setRequired(false)
        .setMaxLength(8),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) {
      await interaction.reply({ content: "Run this in a server.", ephemeral: true });
      return;
    }
    const current = ctx.settings?.features.commandPrefix ?? DEFAULT_PREFIX;
    const nextRaw = interaction.options.getString("value");
    if (!nextRaw) {
      await interaction.reply({
        content: `Prefix is \`${current}\`. Example: \`${current}play never gonna give you up\` or \`/play\`. Change it with \`/prefix value:!\` or \`${current}prefix !\`.`,
      });
      return;
    }
    const cached = await ctx.client.guildConfig.get(interaction.guild.id);
    const member =
      interaction.guild.members.cache.get(interaction.user.id) ??
      (await interaction.guild.members.fetch(interaction.user.id));
    const rank = resolveKnoxRank(member, cached.permissionRows);
    if (rank !== "owner" && !hasMinRank(rank, "admin")) {
      await interaction.reply({
        content: "Only ZARU admins can change the prefix.",
        ephemeral: true,
      });
      return;
    }
    const next = normalizePrefix(nextRaw);
    if (!next) {
      await interaction.reply({
        content: "Prefix must be 1–8 characters, no spaces, and not `/`.",
        ephemeral: true,
      });
      return;
    }
    const settings = await ensureGuildSettings(ctx.client, {
      id: interaction.guild.id,
      name: interaction.guild.name,
      icon: interaction.guild.icon,
      ownerId: interaction.guild.ownerId,
    });
    settings.features.commandPrefix = next;
    await persistGuildSettings(ctx.client, interaction.guild.id, settings);
    await interaction.reply({
      content: `Prefix is now \`${next}\`. Try \`${next}help\` or \`/help\`.`,
    });
  },
};
