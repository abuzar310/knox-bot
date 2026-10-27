import { Events, type Message } from "discord.js";
import { and, eq } from "drizzle-orm";
import { levelRewards } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { addXp } from "../../../lib/xp.js";
import { canGrantRole } from "../../../lib/roles.js";
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
    if (features.noXpChannelIds.includes(message.channelId)) return;

    // the best multiplier among the member's roles (1 when none apply)
    const multiplier = features.xpMultiplierRoles.reduce((best, m) => (message.member?.roles.cache.has(m.roleId) && m.multiplier > best ? m.multiplier : best), 1);
    const gained = Math.round((15 + Math.floor(Math.random() * 11)) * multiplier);
    const result = await addXp(
      client.db,
      message.guild.id,
      message.author.id,
      gained,
      features.xpCooldownSec,
      true,
    );
    if (!result.leveled) return;

    const rewards = await client.db
      .select()
      .from(levelRewards)
      .where(
        and(eq(levelRewards.guildId, message.guild.id), eq(levelRewards.level, result.level)),
      );
    for (const reward of rewards) {
      const role = message.guild.roles.cache.get(reward.roleId);
      if (canGrantRole(role)) await message.member.roles.add(role).catch(() => undefined);
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
