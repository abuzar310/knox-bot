import { Events, type Message, type PartialMessage } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";

async function logChannel(client: KnoxClient, guildId: string) {
  const cached = await client.guildConfig.get(guildId);
  const id = cached.settings.logChannelId;
  if (!id) return { cached, channel: null };
  const guild = client.guilds.cache.get(guildId);
  const channel = guild ? await guild.channels.fetch(id).catch(() => null) : null;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return { cached, channel: null };
  return { cached, channel };
}

export const messageDeleteLog: KnoxBoundEvent = {
  name: Events.MessageDelete,
  async execute(...args: unknown[]) {
    const message = args[0] as Message | PartialMessage;
    if (!message.guild || message.author?.bot) return;
    const client = message.client as KnoxClient;
    if (message.content) {
      client.snipe.set(message.channelId, {
        content: message.content,
        author: message.author?.tag ?? "unknown",
        at: Date.now(),
      });
    }
    const { cached, channel } = await logChannel(client, message.guild.id);
    if (!cached.settings.features.logMessages || !channel) return;
    await channel.send({
      embeds: [
        knoxEmbed(cached.settings.embedColor)
          .setTitle("Message deleted")
          .setDescription(message.content?.slice(0, 1800) || "*no text*")
          .setFooter({ text: `${message.author?.tag ?? "unknown"} in #${"name" in message.channel ? message.channel.name : message.channelId}` }),
      ],
    });
  },
};

export const messageUpdateLog: KnoxBoundEvent = {
  name: Events.MessageUpdate,
  async execute(...args: unknown[]) {
    const oldMsg = args[0] as Message | PartialMessage;
    const newMsg = args[1] as Message | PartialMessage;
    if (!newMsg.guild || newMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;
    const client = newMsg.client as KnoxClient;
    const { cached, channel } = await logChannel(client, newMsg.guild.id);
    if (!cached.settings.features.logMessages || !channel) return;
    await channel.send({
      embeds: [
        knoxEmbed(cached.settings.embedColor)
          .setTitle("Message edited")
          .addFields(
            { name: "Before", value: (oldMsg.content || "*empty*").slice(0, 1000) },
            { name: "After", value: (newMsg.content || "*empty*").slice(0, 1000) },
          )
          .setFooter({ text: newMsg.author?.tag ?? "unknown" }),
      ],
    });
  },
};
