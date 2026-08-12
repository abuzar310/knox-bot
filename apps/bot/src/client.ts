import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { Player } from "discord-player";
import type { KnoxDb, KnoxPool } from "@knox/db";
import type { KnoxCommand, KnoxModule } from "./types.js";
import { GuildConfigCache } from "./config/guild-cache.js";

export class KnoxClient extends Client {
  commands = new Collection<string, KnoxCommand>();
  modules = new Map<string, KnoxModule>();
  db!: KnoxDb;
  pool!: KnoxPool;
  guildConfig!: GuildConfigCache;
  inviteCache = new Map<string, Map<string, number>>();
  snipe = new Map<string, { content: string; author: string; at: number }>();
  tempVoices = new Set<string>();
  player!: Player;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.GuildMember, Partials.Message, Partials.Channel, Partials.Reaction],
    });
  }
}
