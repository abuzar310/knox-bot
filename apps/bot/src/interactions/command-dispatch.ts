import { randomUUID } from "node:crypto";
import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BRAND } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import type { KnoxCommand } from "../types.js";
import { canRunCommand } from "../permissions/resolve.js";
import { logger } from "../logger.js";
import { isDiscordPermissionError, NO_MOD_POWER } from "../lib/assistant/discord-perm.js";

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
      const reason = command.data.name === "zaru" ? NO_MOD_POWER : "You don't have the Discord permission this command needs.";
      await interaction.reply({ content: reason, ephemeral: true });
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
      const reason = command.data.name === "zaru" ? NO_MOD_POWER : gate.reason;
      await interaction.reply({ content: reason, ephemeral: true });
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
    // only errors written for users are shown; anything else stays in the log behind the error id
    const spoken =
      error instanceof Error && error.name === "SettingsNotLoadedError"
        ? error.message
        : isDiscordPermissionError(error)
          ? "I don't have permission for that."
          : null;
    const payload = {
      embeds: [
        new EmbedBuilder()
          .setColor(BRAND.embedColor)
          .setTitle("ZARU hit a snag")
          .setDescription(
            `${spoken ?? "Something went wrong on ZARU's side. Try again in a moment; if it keeps happening, tell an admin and quote the id."}\nError id: \`${errorId}\``,
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
