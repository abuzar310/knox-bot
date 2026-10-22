import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { KnoxDb, KnoxPool } from "@knox/db";
import type { KnoxCommand, KnoxModule } from "./types.js";
import { GuildConfigCache } from "./config/guild-cache.js";
import type { MusicManager } from "./lib/music-session.js";

export class KnoxClient extends Client {
  commands = new Collection<string, KnoxCommand>();
  modules = new Map<string, KnoxModule>();
  db!: KnoxDb;
  pool!: KnoxPool;
  guildConfig!: GuildConfigCache;
  inviteCache = new Map<string, Map<string, number>>();
  snipe = new Map<string, { content: string; author: string; at: number }>();
  tempVoices = new Set<string>();
  /** AFK members per guild, so every message isn't a database lookup (see lib/afk-cache.ts) */
  afk = new Map<string, Set<string>>();
  /** guild:user keys the join gate decided to turn away, so the welcome and invite credit are skipped */
  gatedJoins = new Set<string>();
  /** recent join times per guild, for raid detection */
  joinTimes = new Map<string, number[]>();
  music?: MusicManager;

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
      // nothing the bot repeats (tags, AFK reasons, reminders) can ping @everyone, a role or a user unless a
      // message says so explicitly with its own allowedMentions
      allowedMentions: { parse: [], repliedUser: false },
    });
  }
}
