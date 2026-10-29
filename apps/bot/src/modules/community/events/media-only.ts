import { Events, PermissionFlagsBits, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { allowsMediaOnlyPost } from "../lib/media-only.js";

const noticed = new Map<string, number>();

export const mediaOnlyEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.member) return;
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const ids = cached.settings.features.mediaOnlyChannelIds;
    if (!ids.length) return;
    const parentId = message.channel.isThread() ? message.channel.parentId : null;
    if (!ids.includes(message.channelId) && !(parentId && ids.includes(parentId))) return;
    if (allowsMediaOnlyPost({ content: message.content, attachments: message.attachments.size, stickers: message.stickers.size })) return;
    const removed = await message.delete().then(() => true, () => false);
    if (!removed || !message.channel.isTextBased() || message.channel.isDMBased()) return;
    const key = `${message.guild.id}:${message.author.id}`;
    if (Date.now() - (noticed.get(key) ?? 0) < 10 * 60_000) return;
    noticed.set(key, Date.now());
    const note = await message.channel
      .send({ content: `${message.author}, only pictures and links in here.`, allowedMentions: { users: [message.author.id] } })
      .catch(() => null);
    if (note) setTimeout(() => note.delete().catch(() => undefined), 8_000);
  },
};
