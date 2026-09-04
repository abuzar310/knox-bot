import { Events } from "discord.js";
import type { KnoxEvent } from "../../../types.js";
import { handlePrefixMessage } from "../../../lib/prefix-message.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";

export const prefixMessageEvent: KnoxEvent<typeof Events.MessageCreate> = {
  name: Events.MessageCreate,
  async execute(message) {
    try {
      await handlePrefixMessage(message, message.client as KnoxClient);
    } catch (error) {
      logger.warn({ err: error }, "prefix command failed");
    }
  },
};
