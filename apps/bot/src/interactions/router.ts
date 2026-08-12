import { randomUUID } from "node:crypto";
import { EmbedBuilder, Events, type Interaction } from "discord.js";
import { BRAND, hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { canRunCommand, resolveKnoxRank } from "../permissions/resolve.js";
import { logger } from "../logger.js";
import { TEMPLATE_APPLY_ID, installBlueprint, resultEmbed } from "../modules/community/lib/server-template-ui.js";
import { takePendingTemplate } from "../modules/community/lib/server-template-pending.js";
import { knoxEmbed } from "./embed.js";
import { handleKnoxButton } from "./components.js";
import { handleMusicButton, MUSIC_PREFIX } from "../lib/music-panel.js";

export { knoxEmbed };

export function registerInteractionRouter(client: KnoxClient) {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isButton() && interaction.customId === TEMPLATE_APPLY_ID) {
      await handleTemplateApply(interaction, client);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(MUSIC_PREFIX)) {
      try {
        await handleMusicButton(interaction, client);
      } catch (error) {
        logger.error({ err: error }, "music panel failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That control failed.", ephemeral: true }).catch(() => undefined);
        }
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("knox:")) {
      try {
        await handleKnoxButton(interaction, client);
      } catch (error) {
        logger.error({ err: error }, "button failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That button failed.", ephemeral: true }).catch(() => undefined);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command.", ephemeral: true }).catch(() => undefined);
      return;
    }

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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Knox got the command but had nothing to say. Try again.",
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
            .setTitle("Knox hit a snag")
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
  });
}

async function handleTemplateApply(
  interaction: Extract<Interaction, { isButton(): boolean }>,
  client: KnoxClient,
) {
  if (!interaction.isButton()) return;
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: "Run this in a server.", ephemeral: true });
    return;
  }

  const member =
    interaction.guild.members.cache.get(interaction.user.id) ??
    (await interaction.guild.members.fetch(interaction.user.id));
  const cached = await client.guildConfig.get(interaction.guild.id);
  const rank = resolveKnoxRank(member, cached.permissionRows);
  if (rank !== "owner" && !hasMinRank(rank, "admin")) {
    await interaction.reply({
      content: "Only Knox admins can install a template.",
      ephemeral: true,
    });
    return;
  }

  const blueprint = takePendingTemplate(interaction.guild.id, interaction.user.id);
  if (!blueprint) {
    await interaction.reply({
      content: "That preview expired. Run `/setup template` again.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  const result = await installBlueprint(interaction.guild, blueprint);
  await interaction.editReply({
    embeds: [resultEmbed(cached.settings.embedColor, blueprint, result)],
    components: [],
  });
}
