import {
  type ChatInputCommandInteraction,
  type Message,
  type MessageCreateOptions,
  type MessagePayload,
} from "discord.js";
import type { KnoxClient } from "../client.js";
import { executeChatCommand } from "../interactions/command-dispatch.js";
import { logger } from "../logger.js";
import {
  DEFAULT_PREFIX,
  matchPrefix,
  parsePrefixArgs,
  prefixUsage,
  tokenize,
} from "./prefix.js";

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
      sent = await sent.edit(body);
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
    createdTimestamp: message.createdTimestamp,
    client: message.client,
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    channelId: message.channelId,
    user: message.author,
    member: message.member,
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
      await message.channel.sendTyping().catch(() => undefined);
      sent = await message.reply({ content: "Working…" });
    },
    async editReply(opts: string | MessagePayload | Record<string, unknown>) {
      return send(opts);
    },
    async followUp(opts: string | MessagePayload | Record<string, unknown>) {
      return message.channel.send(stripEphemeral(opts) as MessageCreateOptions);
    },
    options: {
      getSubcommand() {
        return parsed.subcommand ?? "";
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
    await message.reply(
      `Prefix is \`${prefix}\`. Try \`${prefix}help\` or \`/help\`. Mention me like \`@${client.user?.username} ping\`.`,
    );
    return;
  }

  const [name, ...argTokens] = tokenize(matched.rest);
  const command = client.commands.get(name.toLowerCase());
  if (!command) return;

  const json = command.data.toJSON() as {
    name: string;
    options?: { name: string; type: number; required?: boolean; options?: never[] }[];
  };
  const parsed = parsePrefixArgs(json.options, argTokens);
  if (parsed.missing) {
    await message.reply(`Usage: ${prefixUsage(prefix, json.name, json.options)}`);
    return;
  }

  const interaction = prefixInteraction(message, command.data.name, parsed);
  logger.info({ command: command.data.name, prefix }, "prefix command");
  await executeChatCommand(client, interaction, command);
}
