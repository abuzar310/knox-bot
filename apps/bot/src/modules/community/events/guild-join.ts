// When ZARU is added to a server, one message with one button sets the whole server up.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Events, PermissionFlagsBits, type Guild, type TextChannel } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const SETUP_AUTO_ID = "knox:setup:auto";

export function setupPrompt(color: string) {
  return {
    embeds: [
      knoxEmbed(color)
        .setTitle("Thanks for adding ZARU")
        .setDescription(
          "One press sets everything up: a staff-only log, welcome messages with picture cards, a ticket panel, modmail, a starboard, a member counter, anti-phishing, raid protection, nickname cleanup and Discord's own AutoMod rules.\n\nYou can also type `/setup auto` any time. Someone with **Manage Server** has to press it.",
        ),
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(SETUP_AUTO_ID).setLabel("Set up everything").setStyle(ButtonStyle.Success).setEmoji("⚡"))],
  };
}

function somewhereToTalk(guild: Guild): TextChannel | null {
  const me = guild.members.me;
  if (!me) return null;
  const ok = (c: TextChannel) => c.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  const system = guild.systemChannel;
  if (system && ok(system)) return system;
  return (guild.channels.cache.filter((c): c is TextChannel => c.type === ChannelType.GuildText && ok(c)).sort((a, b) => a.rawPosition - b.rawPosition).first() as TextChannel | undefined) ?? null;
}

export const guildJoinPromptEvent: KnoxBoundEvent = {
  name: Events.GuildCreate,
  async execute(...args: unknown[]) {
    const guild = args[0] as Guild;
    const client = guild.client as KnoxClient;
    const channel = somewhereToTalk(guild);
    if (!channel) return;
    const cached = await client.guildConfig.get(guild.id);
    await channel.send(setupPrompt(cached.settings.embedColor)).catch(() => undefined);
  },
};
