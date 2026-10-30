import {
  type ChatInputCommandInteraction,
  type Message,
  type MessageCreateOptions,
  type MessagePayload,
} from "discord.js";
import type { KnoxClient } from "../client.js";
import { executeChatCommand } from "../interactions/command-dispatch.js";
import { logger } from "../logger.js";
import { aliasRewrite } from "./command-aliases.js";
import { parseMusicAsk } from "./music-words.js";
import { runMusicAsk } from "./music-request.js";
import { mayCommand } from "./assistant/run.js";
import { handlePrefixZaruChat, prefixGamesHint } from "./prefix-zaru.js";
import {
  DEFAULT_PREFIX,
  matchPrefix,
  parsePrefixArgs,
  prefixUsage,
  tokenize,
} from "./prefix.js";

/** what the placeholder says while a prefix command runs; it is edited with the real answer */
function placeholderFor(commandName: string) {
  if (["play", "playnext", "search", "lyrics", "playlist", "radio"].includes(commandName)) return "Looking up the song…";
  if (commandName === "zaru") return "Thinking…";
  return "Working on it…";
}

function stripEphemeral(input: string | MessagePayload | Record<string, unknown>) {
  if (typeof input === "string") return { content: input };
  const { ephemeral: _e, flags: _f, fetchReply: _fr, ...rest } = input as Record<
    string,
    unknown
  >;
  return rest;
}

function prefixInteraction(
  message: Message,
  commandName: string,
  parsed: ReturnType<typeof parsePrefixArgs>,
): ChatInputCommandInteraction {
  let replied = false;
  let deferred = false;
  let sent: Message | null = null;

  const send = async (opts: string | MessagePayload | Record<string, unknown>) => {
    const body = stripEphemeral(opts) as MessageCreateOptions;
    if (sent) {
      if (body.embeds && !body.content) body.content = "";
      sent = await sent.edit(body as never);
    } else {
      sent = await message.reply(body);
    }
    replied = true;
    return sent;
  };

  const bool = (name: string) => parsed.values.get(name) === "true";
  const raw = (name: string) => parsed.values.get(name);

  const interaction = {
    commandName,
    /** lets the dispatcher apply the command's default Discord permissions, which slash commands get for free */
    isPrefix: true,
    createdTimestamp: message.createdTimestamp,
    client: message.client,
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    channelId: message.channelId,
    user: message.author,
    member: message.member,
    memberPermissions: message.member?.permissions ?? null,
    get replied() {
      return replied;
    },
    get deferred() {
      return deferred;
    },
    isChatInputCommand: () => true,
    isRepliable: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    async reply(opts: string | MessagePayload | Record<string, unknown>) {
      return send(opts);
    },
    async deferReply() {
      deferred = true;
      if (message.channel.isTextBased() && "sendTyping" in message.channel) {
        await message.channel.sendTyping().catch(() => undefined);
      }
      sent = await message.reply({ content: placeholderFor(commandName) });
    },
    async editReply(opts: string | MessagePayload | Record<string, unknown>) {
      return send(opts);
    },
    async fetchReply() {
      if (!sent) throw new Error("No reply to fetch");
      return sent;
    },
    async followUp(opts: string | MessagePayload | Record<string, unknown>) {
      if (!message.channel.isTextBased() || !("send" in message.channel)) {
        return send(opts);
      }
      return message.channel.send(stripEphemeral(opts) as MessageCreateOptions);
    },
    options: {
      getSubcommand() {
        return parsed.subcommand ?? "";
      },
      getSubcommandGroup(required?: boolean) {
        if (parsed.group) return parsed.group;
        if (required) throw new Error("Missing subcommand group");
        return null;
      },
      getString(name: string, required?: boolean) {
        const v = raw(name);
        if (v == null && required) throw new Error(`Missing ${name}`);
        return v ?? null;
      },
      getInteger(name: string, required?: boolean) {
        const v = raw(name);
        if (v == null) {
          if (required) throw new Error(`Missing ${name}`);
          return null;
        }
        return Number.parseInt(v, 10);
      },
      getNumber(name: string, required?: boolean) {
        const v = raw(name);
        if (v == null) {
          if (required) throw new Error(`Missing ${name}`);
          return null;
        }
        return Number(v);
      },
      getBoolean(name: string, required?: boolean) {
        if (!parsed.values.has(name)) {
          if (required) throw new Error(`Missing ${name}`);
          return null;
        }
        return bool(name);
      },
      getUser(name: string, required?: boolean) {
        const id = raw(name);
        if (!id) {
          if (required) throw new Error(`Missing ${name}`);
          return null;
        }
        return (
          message.mentions.users.get(id) ??
          message.client.users.cache.get(id) ??
          null
        );
      },
      getMember(name: string) {
        const id = raw(name);
        if (!id || !message.guild) return null;
        return message.guild.members.cache.get(id) ?? message.member;
      },
      getChannel(name: string, required?: boolean) {
        const id = raw(name);
        if (!id) {
          if (required) throw new Error(`Missing ${name}`);
          return null;
        }
        return (
          message.mentions.channels.get(id) ??
          message.guild?.channels.cache.get(id) ??
          null
        );
      },
      getAttachment(name: string, required?: boolean) {
        const file = message.attachments.first() ?? null;
        if (!file && required) throw new Error(`Missing ${name}`);
        return file;
      },
      getRole(name: string, required?: boolean) {
        const id = raw(name);
        if (!id) {
          if (required) throw new Error(`Missing ${name}`);
          return null;
        }
        return (
          message.mentions.roles.get(id) ??
          message.guild?.roles.cache.get(id) ??
          null
        );
      },
    },
  };

  return interaction as unknown as ChatInputCommandInteraction;
}

export async function handlePrefixMessage(message: Message, client: KnoxClient) {
  if (message.author.bot || !message.guild) return;

  const cached = await client.guildConfig.get(message.guild.id);
  const prefix = cached.settings.features.commandPrefix || DEFAULT_PREFIX;
  const botId = client.user?.id;
  const matched = matchPrefix(message.content, prefix, botId ? [botId] : []);
  if (!matched) return;

  if (!matched.rest) {
    await message.reply(prefixGamesHint(prefix, cached.settings.embedColor));
    return;
  }

  const tokens = tokenize(matched.rest);
  let name = (tokens[0] ?? "").toLowerCase();
  let argTokens = tokens.slice(1);
  if (name === "zaru") {
    const chat = argTokens.join(" ").trim();
    await handlePrefixZaruChat(message, client, chat);
    return;
  }
  // UnbelievaBoat-style bare words (!work, !bal, !bj, !rob) rewrite to the real command + subcommand,
  // but only when the word isn't itself a registered command (so !shop buy and the rest stay native)
  if (!client.commands.has(name)) {
    const rewritten = aliasRewrite(name, argTokens);
    if (rewritten) {
      name = rewritten.name;
      argTokens = rewritten.argTokens;
    }
  }
  const command = client.commands.get(name);
  if (!command) {
    const music = parseMusicAsk(matched.rest);
    if (music && (await runMusicAsk(message, client, music))) return;
    await handlePrefixZaruChat(message, client, matched.rest);
    return;
  }

  const json = command.data.toJSON() as {
    name: string;
    options?: { name: string; type: number; required?: boolean; options?: never[] }[];
  };
  const parsed = parsePrefixArgs(json.options, argTokens);
  if (parsed.missing) {
    const tail = argTokens.join(" ").trim();
    const numericFirst = /^\d+$/.test(argTokens[0] ?? "");
    const naturalPurge =
      command.data.name === "purge" && parsed.missing === "amount" && !numericFirst && tail.length > 2;
    // "?ban gasolina" is a sentence, not a user mention, so staff say it to ZARU instead of seeing usage
    const naturalBan = command.data.name === "ban" && parsed.missing === "user" && tail.length > 0;
    if ((naturalPurge || naturalBan) && message.member && (await mayCommand(client, message.member))) {
      await handlePrefixZaruChat(message, client, matched.rest);
      return;
    }
    // show the usage for the exact subcommand they used and point at the missing argument
    type Opt = { name: string; type: number; required?: boolean; options?: Opt[] };
    let opts = (json.options as Opt[] | undefined) ?? [];
    const path = [json.name];
    if (parsed.group) {
      opts = opts.find((o) => o.name === parsed.group)?.options ?? [];
      path.push(parsed.group);
    }
    if (parsed.subcommand) {
      opts = opts.find((o) => o.name === parsed.subcommand)?.options ?? [];
      path.push(parsed.subcommand);
    }
    const leafOpts = opts.filter((o) => o.type !== 1 && o.type !== 2); // not SUB/GROUP
    if (leafOpts.length) {
      const args = leafOpts.map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(" ");
      await message.reply(`\`${prefix}${path.join(" ")} ${args}\` — you're missing **${parsed.missing}**.`);
    } else {
      await message.reply(`Usage: ${prefixUsage(prefix, json.name, json.options)}`);
    }
    return;
  }

  const interaction = prefixInteraction(message, command.data.name, parsed);
  logger.info({ command: command.data.name, prefix }, "prefix command");
  await executeChatCommand(client, interaction, command);
}

const CATCHUP_MS = 15 * 60_000;
let catchingUp: Promise<void> | null = null;

/** commands sent while Discord dropped the gateway never arrive, so look for unanswered ones */
export function catchUpRecentPrefix(client: KnoxClient) {
  if (catchingUp) return catchingUp;
  catchingUp = runCatchUp(client).finally(() => {
    catchingUp = null;
  });
  return catchingUp;
}

async function runCatchUp(client: KnoxClient) {
  if (!client.user) return;
  const cutoff = Date.now() - CATCHUP_MS;
  for (const guild of client.guilds.cache.values()) {
    const cached = client.guildConfig.peek(guild.id) ?? (await client.guildConfig.get(guild.id));
    const musicId = cached.settings.features.musicChannelId;
    const channels = guild.channels.cache.filter(
      (channel) => channel.isTextBased() && !channel.isDMBased() && (channel.id === musicId || channel.name === "music"),
    );
    for (const channel of channels.values()) {
      if (!channel.isTextBased()) continue;
      const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (!recent) continue;
      const ordered = [...recent.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      for (const message of ordered) {
        if (message.author.bot || message.createdTimestamp < cutoff) continue;
        const prefix = cached.settings.features.commandPrefix || DEFAULT_PREFIX;
        const text = message.content.trim();
        if (!text.startsWith(prefix) && !text.startsWith("?")) continue;
        const answered = ordered.some((other) => {
          if (other.author.id !== client.user?.id || other.reference?.messageId !== message.id) return false;
          return other.content !== "This command only works in a server.";
        });
        if (answered) continue;
        if (message.guild && !message.member) await message.guild.members.fetch(message.author.id).catch(() => undefined);
        logger.info({ channelId: channel.id }, "answering a command missed while the gateway was down");
        await handlePrefixMessage(message, client);
      }
    }
  }
}
