import { Events, type Message } from "discord.js";
import { and, eq } from "drizzle-orm";
import { levelRewards } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { addXp } from "../../../lib/xp.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const xpEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.member) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    const features = cached.settings.features;
    if (!cached.settings.moduleFlags.levels || !features.levelsEnabled) return;
    if (features.countingChannelId && message.channelId === features.countingChannelId) return;

    const gained = 15 + Math.floor(Math.random() * 11);
    const result = await addXp(
      client.db,
      message.guild.id,
      message.author.id,
      gained,
      features.xpCooldownSec,
    );
    if (!result.leveled) return;

    const rewards = await client.db
      .select()
      .from(levelRewards)
      .where(
        and(eq(levelRewards.guildId, message.guild.id), eq(levelRewards.level, result.level)),
      );
    for (const reward of rewards) {
      await message.member.roles.add(reward.roleId).catch(() => undefined);
    }

    const channelId = features.levelUpChannelId ?? message.channelId;
    const channel = await message.guild.channels.fetch(channelId).catch(() => message.channel);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    await channel.send({
      embeds: [
        knoxEmbed(cached.settings.embedColor)
          .setTitle("Level up")
          .setDescription(`${message.author} hit **level ${result.level}**`),
      ],
    });
  },
};
