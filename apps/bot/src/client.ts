import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
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

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
      ],
      partials: [Partials.GuildMember],
    });
  }
}
