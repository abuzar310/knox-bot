import { Events, type GuildScheduledEvent, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { bumpMessage } from "../../../lib/stats.js";
import { announceNewEvent } from "../../../lib/event-reminders.js";

/** every human message counts, whatever modules are on: /stats is only as good as its numbers */
export const statsMessageEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || message.system) return;
    bumpMessage(message.client as KnoxClient, message.guild.id, message.author.id, message.channelId);
  },
};

export const eventCreatedEvent: KnoxBoundEvent = {
  name: Events.GuildScheduledEventCreate,
  async execute(...args: unknown[]) {
    const event = args[0] as GuildScheduledEvent;
    await announceNewEvent(event.client as KnoxClient, event);
  },
};
