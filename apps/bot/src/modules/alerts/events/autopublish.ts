import { ChannelType, Events, MessageFlags, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { PublishLimiter } from "../../../lib/feeds/publish-limit.js";
import { logger } from "../../../logger.js";

const limiter = new PublishLimiter();

export const autoPublishEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.channel.type !== ChannelType.GuildAnnouncement) return;
    if (message.system || message.flags.has(MessageFlags.Crossposted)) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.alerts) return;
    if (!cached.settings.features.autoPublishChannelIds.includes(message.channelId)) return;
    if (!message.crosspostable) return;
    if (!limiter.take(message.channelId)) {
      logger.debug({ channelId: message.channelId }, "auto-publish skipped: ten per hour reached");
      return;
    }
    await message.crosspost().catch((err) => logger.debug({ err, channelId: message.channelId }, "auto-publish failed"));
  },
};
