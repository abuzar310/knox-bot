import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { applyServerTemplate } from "./apply-server-template.js";
import {
  KNOX_PRESETS,
  blueprintFromDiscordTemplate,
  parseTemplateCode,
  type ServerBlueprint,
} from "./server-blueprint.js";
import { setPendingTemplate } from "./server-template-pending.js";

export const TEMPLATE_APPLY_ID = "knox:tpl:apply";

function channelLabel(type: ChannelType, name: string) {
  if (type === ChannelType.GuildCategory) return `▸ ${name}`;
  if (type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice) {
    return `  🔊 ${name}`;
  }
  return `  #${name}`;
}

export function templatePreviewEmbed(color: string | undefined, blueprint: ServerBlueprint) {
  const roles = blueprint.roles.map((r) => r.name).slice(0, 20).join(", ") || "none";
  const channels = blueprint.channels
    .slice(0, 25)
    .map((c) => channelLabel(c.type, c.name))
    .join("\n");
  const extra =
    blueprint.channels.length > 25 ? `\n…and ${blueprint.channels.length - 25} more` : "";

  return knoxEmbed(color)
    .setTitle(`Install ${blueprint.name}`)
    .setDescription(
      `${blueprint.description}\n\nKnox will **add** these roles and channels. Existing ones with the same name are skipped. Nothing is deleted.`,
    )
    .addFields(
      { name: `Roles (${blueprint.roles.length})`, value: roles.slice(0, 1000) || "—" },
      {
        name: `Channels (${blueprint.channels.length})`,
        value: (channels + extra).slice(0, 1000) || "—",
      },
    );
}

export function templateApplyRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TEMPLATE_APPLY_ID)
      .setLabel("Install into this server")
      .setStyle(ButtonStyle.Success),
  );
}

export async function resolveBlueprint(
  interaction: ChatInputCommandInteraction,
): Promise<ServerBlueprint | string> {
  const preset = interaction.options.getString("preset");
  const rawCode = interaction.options.getString("code");

  if (rawCode) {
    const code = parseTemplateCode(rawCode);
    if (!code) return "That doesn't look like a template code. Paste a `discord.new/CODE` link.";
    try {
      const fetched = await interaction.client.fetchGuildTemplate(code);
      return blueprintFromDiscordTemplate(
        fetched.code,
        fetched.name,
        fetched.description,
        fetched.serializedGuild,
      );
    } catch {
      return "Couldn't load that template. Check the code and that it is public.";
    }
  }

  if (preset && KNOX_PRESETS[preset]) return KNOX_PRESETS[preset];

  return (
    "Pick a Knox preset **or** paste a Discord template code.\n" +
    "Presets: `gaming` `community` `study` `creator`\n" +
    "Or Server Settings → Overview → Server Template → copy the `discord.new` link."
  );
}

export function resultEmbed(
  color: string | undefined,
  blueprint: ServerBlueprint,
  result: Awaited<ReturnType<typeof applyServerTemplate>>,
) {
  const lines = [
    result.createdRoles.length ? `Roles added: ${result.createdRoles.join(", ")}` : null,
    result.createdChannels.length
      ? `Channels added: ${result.createdChannels.join(", ")}`
      : null,
    result.skippedRoles.length || result.skippedChannels.length
      ? `Already existed: ${[...result.skippedRoles, ...result.skippedChannels].join(", ")}`
      : null,
    result.errors.length ? `Issues: ${result.errors.join(" · ")}` : null,
  ].filter(Boolean);

  if (!result.createdRoles.length && !result.createdChannels.length && !result.errors.length) {
    lines.push("Everything in this template was already in the server.");
  }

  return knoxEmbed(color)
    .setTitle(`Installed ${blueprint.name}`)
    .setDescription(lines.join("\n").slice(0, 4000) || "Done.");
}

export async function installBlueprint(guild: Guild, blueprint: ServerBlueprint) {
  return applyServerTemplate(guild, blueprint);
}

export function stashPreview(guildId: string, userId: string, blueprint: ServerBlueprint) {
  setPendingTemplate(guildId, userId, blueprint);
}
