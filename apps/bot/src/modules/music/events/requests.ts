// A music request channel: a plain song name in that channel plays, without the prefix.
import { Events, type Message } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { runMusicAsk } from "../../../lib/music-request.js";
import { parseMusicAsk } from "../../../lib/music-words.js";
import { matchPrefix } from "../../../lib/prefix.js";

export const musicRequestEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(message) {
    const typed = message as Message;
    if (typed.author.bot || !typed.guild || !typed.member) return;
    if (!typed.channel.isTextBased() || typed.channel.isDMBased()) return;
    const client = typed.client as KnoxClient;
    const cached = client.guildConfig.peek(typed.guild.id) ?? (await client.guildConfig.get(typed.guild.id));
    if (!cached.settings.moduleFlags.music) return;
    if (!cached.settings.features.musicChannelId || typed.channel.id !== cached.settings.features.musicChannelId) return;
    const content = typed.content.trim();
    if (content.length < 2 || content.length > 200) return;
    const prefix = cached.settings.features.commandPrefix || "?";
    const botId = client.user?.id;
    if (matchPrefix(content, prefix, botId ? [botId] : [])) return;
    const ask = parseMusicAsk(content) ?? { kind: "play" as const, query: content };
    await runMusicAsk(typed, client, ask);
  },
};
