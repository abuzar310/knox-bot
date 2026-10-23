import { ChannelType, Events, type Message, type StringSelectMenuInteraction } from "discord.js";
import { eq } from "drizzle-orm";
import { modmailThreads } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import {
  NOTE_PREFIX,
  guildPicker,
  modmailGuildsFor,
  openModmail,
  openThreadFor,
  recentChoice,
  relayToStaff,
  relayToUser,
  rememberChoice,
  shouldNudge,
} from "../lib/modmail.js";

/** open conversations are loaded once at start, so each message costs a Map lookup */
export const modmailSweepEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const client = args[0] as KnoxClient;
    const rows = await client.db.select().from(modmailThreads).where(eq(modmailThreads.open, true));
    for (const row of rows) client.modmailThreads.set(row.threadId, { id: row.id, guildId: row.guildId, userId: row.userId });
  },
};

/** a DM to ZARU: into the open conversation, or a new one with the right server */
export const modmailDmEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (message.author.bot || message.channel.type !== ChannelType.DM) return;
    if (!message.content.trim() && !message.attachments.size) return;
    const client = message.client as KnoxClient;
    try {
      const open = [...client.modmailThreads.values()].filter((r) => r.userId === message.author.id);
      if (open.length === 1) {
        await relayToStaff(client, open[0]!, message);
        return;
      }
      const chosen = recentChoice(client, message.author.id);
      if (open.length > 1) {
        const target = open.find((r) => r.guildId === chosen);
        if (target) {
          await relayToStaff(client, target, message);
          return;
        }
        client.modmailPending.set(message.author.id, message);
        const guilds = open.map((r) => client.guilds.cache.get(r.guildId)).filter((g): g is NonNullable<typeof g> => Boolean(g));
        await message.reply({ content: "You have conversations open with several servers. Which one is this for?", components: [guildPicker(guilds)] });
        return;
      }
      const candidates = await modmailGuildsFor(client, message.author);
      if (!candidates.length) {
        if (shouldNudge(client, message.author.id)) {
          await message.reply("Hi! I'm ZARU. None of the servers we share has modmail switched on, so nobody will read this here. Ask in the server instead.").catch(() => undefined);
        }
        return;
      }
      const guild = candidates.length === 1 ? candidates[0]! : candidates.find((g) => g.id === chosen);
      if (!guild) {
        client.modmailPending.set(message.author.id, message);
        await message.reply({ content: "Which server would you like to contact?", components: [guildPicker(candidates)] });
        return;
      }
      const opened = await openModmail(client, guild, message.author, "by the member");
      if (!opened) {
        await message.reply(`**${guild.name}** has modmail on, but I couldn't open a thread there (channel or permissions). Please tell the staff another way.`).catch(() => undefined);
        return;
      }
      rememberChoice(client, message.author.id, guild.id);
      await relayToStaff(client, opened.row, message);
      await message.reply(`Your message reached **${guild.name}** staff. Keep writing here; replies arrive as DMs.`).catch(() => undefined);
    } catch (err) {
      logger.warn({ err, userId: message.author.id }, "modmail DM failed");
    }
  },
};

/** staff writing in a modmail thread */
export const modmailThreadEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || !message.channel.isThread()) return;
    const client = message.client as KnoxClient;
    const row = client.modmailThreads.get(message.channelId);
    if (!row) return;
    if (message.content.trimStart().startsWith(NOTE_PREFIX)) {
      await message.react("🗒️").catch(() => undefined);
      return;
    }
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    await relayToUser(client, row, message).catch((err) => logger.warn({ err, threadId: message.channelId }, "modmail relay to member failed"));
  },
};

/** the member picked a server for their pending DM */
export async function handleModmailPick(interaction: StringSelectMenuInteraction, client: KnoxClient) {
  const guildId = interaction.values[0];
  const guild = guildId ? client.guilds.cache.get(guildId) : null;
  const pending = client.modmailPending.get(interaction.user.id);
  client.modmailPending.delete(interaction.user.id);
  if (!guild) {
    await interaction.update({ content: "That server isn't available any more.", components: [] });
    return;
  }
  rememberChoice(client, interaction.user.id, guild.id);
  let row = openThreadFor(client, guild.id, interaction.user.id);
  if (!row) {
    const opened = await openModmail(client, guild, interaction.user, "by the member");
    if (!opened) {
      await interaction.update({ content: `I couldn't open a thread in **${guild.name}** (channel or permissions).`, components: [] });
      return;
    }
    row = opened.row;
  }
  if (pending) await relayToStaff(client, row, pending);
  await interaction.update({ content: `Sent to **${guild.name}** staff. Keep writing here; replies arrive as DMs.`, components: [] });
}
