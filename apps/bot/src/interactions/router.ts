import { randomUUID } from "node:crypto";
import { EmbedBuilder, Events, type Interaction } from "discord.js";
import { BRAND } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { canRunCommand } from "../permissions/resolve.js";
import { logger } from "../logger.js";

function colorFromHex(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function registerInteractionRouter(client: KnoxClient) {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    const errorId = randomUUID().slice(0, 8);

    try {
      const guildId = interaction.guildId;
      const cached = guildId
        ? await client.guildConfig.get(guildId)
        : {
            settings: null,
            permissionRows: [],
            overrides: [],
          };

      const member =
        interaction.guild?.members.cache.get(interaction.user.id) ?? null;

      const gate = canRunCommand({
        member,
        command,
        settings: cached.settings,
        permissionRows: cached.permissionRows,
        overrides: cached.overrides,
      });

      if (!gate.ok) {
        await interaction.reply({
          content: gate.reason,
          ephemeral: true,
        });
        return;
      }

      await command.execute(interaction, {
        client,
        settings: cached.settings,
      });
    } catch (error) {
      logger.error({ err: error, errorId, command: interaction.commandName }, "command failed");
      const payload = {
        embeds: [
          new EmbedBuilder()
            .setColor(BRAND.embedColor)
            .setTitle("Knox hit a snag")
            .setDescription(`Something broke. Error id: \`${errorId}\``),
        ],
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  });
}

export function knoxEmbed(embedColorHex?: string) {
  return new EmbedBuilder().setColor(
    embedColorHex ? colorFromHex(embedColorHex) : BRAND.embedColor,
  );
}
