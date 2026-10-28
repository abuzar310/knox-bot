// Staff grants, pay, and rob. Gamble spins stay out so the channel doesn't flood.
import { EmbedBuilder, type Guild } from "discord.js";
import type { GuildSettings } from "@knox/config";

export async function logMoney(guild: Guild, settings: GuildSettings | null | undefined, text: string) {
  const channelId = settings?.features.moneyLogChannelId;
  if (!channelId || !text.trim()) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  await channel
    .send({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("Coins").setDescription(text.slice(0, 2000)).setTimestamp(new Date())],
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
}
