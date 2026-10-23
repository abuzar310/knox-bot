import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { loadCanvas } from "../../../lib/cards.js";

export const welcomeCardCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("welcomecard")
    .setDescription("Attach a picture card (avatar, name, member number) to welcome messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const enabled = interaction.options.getBoolean("enabled", true);
    if (enabled && !(await loadCanvas())) {
      await interaction.reply({ content: "Picture cards aren't available on this ZARU host (the drawing library didn't load), so welcomes stay text-only.", ephemeral: true });
      return;
    }
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      community: { ...ctx.settings.community, welcomeCardEnabled: enabled },
    });
    await interaction.reply({
      content: enabled
        ? `Welcome messages now come with a card.${ctx.settings.community.welcomeEnabled ? "" : " Welcomes themselves are off: /setup welcome switches them on."}`
        : "Welcome cards are off; welcomes stay as text.",
      ephemeral: true,
    });
  },
};
