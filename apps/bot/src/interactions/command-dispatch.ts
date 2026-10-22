import { randomUUID } from "node:crypto";
import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BRAND } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import type { KnoxCommand } from "../types.js";
import { canRunCommand } from "../permissions/resolve.js";
import { logger } from "../logger.js";

export async function executeChatCommand(
  client: KnoxClient,
  interaction: ChatInputCommandInteraction,
  command: KnoxCommand,
) {
  const errorId = randomUUID().slice(0, 8);
  try {
    if (command.data.name === "ping") {
      await command.execute(interaction, { client, settings: null });
      return;
    }
    const guildId = interaction.guildId;
    const cached = guildId
      ? await client.guildConfig.get(guildId)
      : {
          settings: null,
          permissionRows: [],
          overrides: [],
        };

    const member = interaction.guild?.members.cache.get(interaction.user.id) ?? null;
    // a prefix command bypasses Discord's own permission screen for slash commands, so apply the command's
    // default member permissions here
    const viaPrefix = (interaction as unknown as { isPrefix?: boolean }).isPrefix === true;
    const needed = command.data.toJSON().default_member_permissions;
    if (viaPrefix && member && needed && !member.permissions.has(BigInt(needed))) {
      await interaction.reply({ content: "You don't have the Discord permission this command needs.", ephemeral: true });
      return;
    }
    const gate = canRunCommand({
      member,
      command,
      settings: cached.settings,
      permissionRows: cached.permissionRows,
      overrides: cached.overrides,
    });

    if (!gate.ok) {
      await interaction.reply({ content: gate.reason, ephemeral: true });
      return;
    }

    await command.execute(interaction, {
      client,
      settings: cached.settings,
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "ZARU got the command but had nothing to say. Try again.",
        ephemeral: true,
      });
    }
  } catch (error) {
    logger.error({ err: error, errorId, command: interaction.commandName }, "command failed");
    const raw = error instanceof Error ? error.message : String(error);
    const payload = {
      embeds: [
        new EmbedBuilder()
          .setColor(BRAND.embedColor)
          .setTitle("ZARU hit a snag")
          .setDescription(
            `Error id: \`${errorId}\`\n\`${raw.replace(/`/g, "'").slice(0, 400)}\``,
          ),
      ],
      ephemeral: true,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => undefined);
    } else {
      await interaction.reply(payload).catch(() => undefined);
    }
  }
}
