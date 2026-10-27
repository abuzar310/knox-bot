// Chat money (UnbelievaBoat): members quietly earn coins for talking, with a per-member cooldown. Off by default
// (chatMoneyMax 0); turn it on with /eco config. Silent — no reply — so it never spams the channel.
import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { addWallet } from "../../../lib/xp.js";

export const chatMoneyEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.content.trim()) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    const f = cached.settings.features;
    if (!cached.settings.moduleFlags.levels || !f.economyEnabled) return;
    if (f.chatMoneyMax <= 0) return; // off
    // skip the channels that don't count as real chat (same rule as XP)
    if (f.countingChannelId && message.channelId === f.countingChannelId) return;
    if (f.noXpChannelIds.includes(message.channelId)) return;

    const key = `${message.guild.id}:${message.author.id}`;
    if (Date.now() - (client.chatMoneyCooldown.get(key) ?? 0) < f.chatMoneyCooldownSec * 1000) return;
    client.chatMoneyCooldown.set(key, Date.now());

    const min = Math.min(f.chatMoneyMin, f.chatMoneyMax);
    const max = Math.max(f.chatMoneyMin, f.chatMoneyMax);
    const amount = min + Math.floor(Math.random() * (max - min + 1));
    if (amount > 0) await addWallet(client.db, message.guild.id, message.author.id, amount);
  },
};
