import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { KnoxDb, KnoxPool } from "@knox/db";
import type { KnoxCommand, KnoxModule } from "./types.js";
import { GuildConfigCache } from "./config/guild-cache.js";
import type { MusicManager } from "./lib/music-session.js";
import { emptyStatsBuffer } from "./lib/stats.js";

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
  /** sticky notes per channel (lib/engagement.ts), loaded once at start */
  stickies = new Map<string, { guildId: string; content: string; lastMessageId: string | null }>();
  stickyTimers = new Map<string, NodeJS.Timeout>();
  /** open modmail conversations by thread id (lib/modmail.ts), loaded once at start */
  modmailThreads = new Map<string, { id: number; guildId: string; userId: string }>();
  /** which server a member last chose for modmail, and when */
  modmailChoice = new Map<string, { guildId: string; at: number }>();
  /** a DM waiting for the member to pick a server */
  modmailPending = new Map<string, import("discord.js").Message>();
  /** when each person was last told no server has modmail on */
  modmailNudged = new Map<string, number>();
  /** seconds banked towards the next voice-XP minute, per guild:user (lib/voice-xp.ts) */
  voiceAccum = new Map<string, number>();
  /** highlight words per guild: word → members (community/lib/highlights.ts), loaded once at start */
  highlightWords = new Map<string, Map<string, Set<string>>>();
  /** where each member last wrote, so highlights skip channels they are active in */
  lastSeen = new Map<string, { channelId: string; at: number }>();
  highlightCooldown = new Map<string, number>();
  /** last spin or flip per guild:user (modules/levels/commands/gamble.ts) */
  gambleCooldown = new Map<string, number>();
  /** activity counters waiting for the next flush (lib/stats.ts) */
  statsBuffer = emptyStatsBuffer();
  /** when each server's scheduled events were last looked at (lib/event-reminders.ts) */
  eventsCheckedAt = new Map<string, number>();
  /** auto-responses per guild (community/lib/auto-responses.ts), loaded once at start */
  autoResponses = new Map<string, import("@knox/db").AutoResponseRow[]>();
  autoResponseCooldown = new Map<string, number>();
  confessCooldown = new Map<string, number>();
  /** the last server scan + analysis per guild (community/lib/server-report.ts), kept an hour */
  serverBrain = new Map<string, import("./modules/community/lib/server-report.js").Brain>();
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
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildScheduledEvents,
      ],
      partials: [Partials.GuildMember, Partials.Message, Partials.Channel, Partials.Reaction],
      // nothing the bot repeats (tags, AFK reasons, reminders) can ping @everyone, a role or a user unless a
      // message says so explicitly with its own allowedMentions
      allowedMentions: { parse: [], repliedUser: false },
    });
  }
}
