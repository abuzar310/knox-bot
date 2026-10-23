import { Events, type Interaction } from "discord.js";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { resolveKnoxRank } from "../permissions/resolve.js";
import { logger } from "../logger.js";
import { executeChatCommand } from "./command-dispatch.js";
import { TEMPLATE_APPLY_ID, installBlueprint, resultEmbed } from "../modules/community/lib/server-template-ui.js";
import { takePendingTemplate } from "../modules/community/lib/server-template-pending.js";
import { knoxEmbed } from "./embed.js";
import { handleKnoxButton } from "./components.js";
import { handleMusicButton, MUSIC_PREFIX } from "../lib/music-panel.js";
import { handleSearchButton, SEARCH_PREFIX } from "../modules/music/commands/search.js";
import { ABOUT_TOPIC_ID, handleAboutSelect } from "../lib/about.js";
import { handleKnoxModal } from "./modals.js";
import { APP_PREFIX, handleApplyButton } from "../modules/community/lib/applications.js";
import { MODMAIL_PICK_ID } from "../modules/community/lib/modmail.js";
import { handleModmailPick } from "../modules/community/events/modmail.js";
import { TICKET_TOPIC_ID, openTicketModal } from "../modules/community/lib/ticket-open.js";

export { knoxEmbed };

function patchReplyAfterDefer(interaction: Interaction) {
  if (!interaction.isRepliable()) return;
  const original = interaction.reply.bind(interaction);
  // ponytail: Discord needs an ack in 3s; if we defer, later reply() must become editReply
  Object.assign(interaction, {
    reply(options: Parameters<typeof original>[0]) {
      if (interaction.deferred) {
        return interaction.editReply(
          (typeof options === "string" ? options : { ...options, ephemeral: undefined }) as Parameters<
            typeof interaction.editReply
          >[0],
        );
      }
      return original(options);
    },
  });
}

export function registerInteractionRouter(client: KnoxClient) {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    logger.info(
      {
        type: interaction.type,
        command: "commandName" in interaction ? interaction.commandName : undefined,
        customId: "customId" in interaction ? interaction.customId : undefined,
      },
      "interaction",
    );
    patchReplyAfterDefer(interaction);
    const watchdog = setTimeout(() => {
      if (!interaction.isRepliable() || interaction.replied || interaction.deferred) return;
      if (interaction.isMessageComponent()) {
        void interaction.deferUpdate().catch(() => undefined);
        return;
      }
      void interaction.deferReply().catch(() => undefined);
    }, 2500); // Discord drops the interaction at 3 s; defer before that if the handler is slow

    try {
    if (interaction.isButton() && interaction.customId === TEMPLATE_APPLY_ID) {
      await handleTemplateApply(interaction, client);
      return;
    }

    if (interaction.isButton() && (interaction.customId.startsWith(SEARCH_PREFIX) || interaction.customId.startsWith(MUSIC_PREFIX)) && interaction.guildId) {
      const flags = (await client.guildConfig.get(interaction.guildId)).settings.moduleFlags;
      if (!flags.music) {
        await interaction.reply({ content: "The music module is off in this server.", ephemeral: true }).catch(() => undefined);
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith(SEARCH_PREFIX)) {
      try {
        await handleSearchButton(interaction, client);
      } catch (error) {
        logger.error({ err: error }, "music search failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That search failed.", ephemeral: true }).catch(() => undefined);
        }
      }
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

    if (interaction.isStringSelectMenu() && interaction.customId === ABOUT_TOPIC_ID) {
      try {
        await handleAboutSelect(interaction);
      } catch (error) {
        logger.error({ err: error }, "about menu failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That menu failed.", ephemeral: true }).catch(() => undefined);
        }
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("knox:")) {
      try {
        await handleKnoxModal(interaction, client);
      } catch (error) {
        logger.error({ err: error }, "modal failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That form failed.", ephemeral: true }).catch(() => undefined);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === TICKET_TOPIC_ID && interaction.guildId) {
      const flags = (await client.guildConfig.get(interaction.guildId)).settings.moduleFlags;
      if (!flags.community) {
        await interaction.reply({ content: "The community module is off in this server.", ephemeral: true }).catch(() => undefined);
        return;
      }
      try {
        await openTicketModal(interaction, client, Number(interaction.values[0] ?? -1));
      } catch (error) {
        logger.error({ err: error }, "ticket topic menu failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That menu failed.", ephemeral: true }).catch(() => undefined);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === MODMAIL_PICK_ID) {
      try {
        await handleModmailPick(interaction, client);
      } catch (error) {
        logger.error({ err: error }, "modmail pick failed");
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(APP_PREFIX) && interaction.guildId) {
      const flags = (await client.guildConfig.get(interaction.guildId)).settings.moduleFlags;
      if (!flags.community) {
        await interaction.reply({ content: "The community module is off in this server.", ephemeral: true }).catch(() => undefined);
        return;
      }
      try {
        await handleApplyButton(interaction, client);
      } catch (error) {
        logger.error({ err: error }, "application button failed");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "That button failed.", ephemeral: true }).catch(() => undefined);
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
    await executeChatCommand(client, interaction, command);
    } finally {
      clearTimeout(watchdog);
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
      content: "Only ZARU admins can install a template.",
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
