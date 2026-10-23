// When ZARU arrives (and once for servers it was already in), it reads the whole server and posts what it
// understands, with one button to set everything up and one to tidy the channels.
import { ChannelType, Events, PermissionFlagsBits, type Guild, type TextChannel } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { logger } from "../../../logger.js";
import { reportMessage, thinkAbout } from "../lib/server-report.js";

export { SETUP_AUTO_ID } from "../lib/server-report.js";

function somewhereToTalk(guild: Guild): TextChannel | null {
  const me = guild.members.me;
  if (!me) return null;
  const ok = (c: TextChannel) => c.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  const system = guild.systemChannel;
  if (system && ok(system)) return system;
  return (guild.channels.cache.filter((c): c is TextChannel => c.type === ChannelType.GuildText && ok(c)).sort((a, b) => a.rawPosition - b.rawPosition).first() as TextChannel | undefined) ?? null;
}

/** reads the server and posts the report; remembers that it did, so it happens once per server */
export async function introduce(client: KnoxClient, guild: Guild) {
  const channel = somewhereToTalk(guild);
  if (!channel) return false;
  const cached = await client.guildConfig.get(guild.id);
  if (cached.degraded) return false;
  const brain = await thinkAbout(client, guild, true);
  await channel.send({
    content: "Thanks for having me. I read the whole server; here is what I understand. One press sets everything up, the other tidies the channels. `/setup scan` repeats this any time.",
    ...reportMessage(guild, brain, cached.settings.embedColor),
  });
  await persistGuildSettings(client, guild.id, { ...cached.settings, features: { ...cached.settings.features, brainReportAt: new Date().toISOString() } });
  return true;
}

export const guildJoinPromptEvent: KnoxBoundEvent = {
  name: Events.GuildCreate,
  async execute(...args: unknown[]) {
    const guild = args[0] as Guild;
    const client = guild.client as KnoxClient;
    // the member and channel caches fill a moment after the join event
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await introduce(client, guild).catch((err) => logger.warn({ err, guildId: guild.id }, "introduction failed"));
  },
};

/** servers ZARU was already in before this existed get their report once, a minute after boot */
export const introduceExistingEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const client = args[0] as KnoxClient;
    setTimeout(() => {
      void (async () => {
        for (const guild of client.guilds.cache.values()) {
          const cached = await client.guildConfig.get(guild.id);
          if (cached.degraded || cached.settings.features.brainReportAt) continue;
          await introduce(client, guild).catch((err) => logger.warn({ err, guildId: guild.id }, "introduction failed"));
        }
      })();
    }, 60_000).unref();
  },
};
