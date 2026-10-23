import {
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const knoxRankEnum = pgEnum("knox_rank", [
  "owner",
  "admin",
  "mod",
  "dj",
  "member",
]);

export const allowTypeEnum = pgEnum("allow_type", ["role", "user"]);
export const effectEnum = pgEnum("effect", ["allow", "deny"]);

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  ownerId: text("owner_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  premium: boolean("premium").default(false).notNull(),
});

export type ModerationConfig = {
  antiInvite: boolean;
  antiSpam: boolean;
  maxMentions: number;
  ignoredChannelIds: string[];
  /** delete + time out messages linking to known scam domains or fake Discord/Nitro/Steam sites */
  antiPhishing: boolean;
  /** join gate: accounts younger than this many hours are turned away (0 = off) */
  joinGateMinAccountAgeHours: number;
  /** join gate: members without a profile picture are turned away */
  joinGateRequireAvatar: boolean;
  /** raid mode switches itself on at this many joins within a minute (0 = off) */
  raidJoinsPerMinute: number;
  /** raid mode: invites paused, new joins turned away */
  raidMode: boolean;
  /** when raid mode switches itself off (ISO time), or null */
  raidModeUntil: string | null;
  /** fix unreadable nicknames (zalgo, symbol spam) on join and rename */
  autoDecancer: boolean;
  /** channels the current lockdown locked, so /lockdown off restores exactly those */
  lockdownChannelIds: string[];
  /** AI moderation of messages (needs OPENAI_API_KEY or ANTHROPIC_API_KEY on the host) */
  aiModeration: boolean;
  /** words blocked outright through a Discord AutoMod keyword rule (lib/safety/blocked-words.ts) */
  blockedWords: string[];
};

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  antiInvite: true,
  antiSpam: true,
  maxMentions: 5,
  ignoredChannelIds: [],
  antiPhishing: true,
  joinGateMinAccountAgeHours: 0,
  joinGateRequireAvatar: false,
  raidJoinsPerMinute: 0,
  raidMode: false,
  raidModeUntil: null,
  autoDecancer: false,
  lockdownChannelIds: [],
  aiModeration: false,
  blockedWords: [],
};

export type CommunityConfig = {
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  goodbyeEnabled: boolean;
  goodbyeChannelId: string | null;
  goodbyeMessage: string;
  invitesEnabled: boolean;
  invitesChannelId: string | null;
  autoRoleId: string | null;
  /** attach a picture card to welcome messages */
  welcomeCardEnabled: boolean;
  /** private message sent to new members, or null */
  welcomeDmMessage: string | null;
};

export const DEFAULT_COMMUNITY_CONFIG: CommunityConfig = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage:
    "Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.",
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: "**{username}** left {server}. We are now {membercount} members.",
  invitesEnabled: false,
  invitesChannelId: null,
  autoRoleId: null,
  welcomeCardEnabled: false,
  welcomeDmMessage: null,
};

export type FeatureConfig = {
  levelsEnabled: boolean;
  levelUpChannelId: string | null;
  xpCooldownSec: number;
  starboardEnabled: boolean;
  starboardChannelId: string | null;
  starboardMin: number;
  ticketCategoryId: string | null;
  ticketLogChannelId: string | null;
  economyEnabled: boolean;
  countingChannelId: string | null;
  countingCurrent: number;
  countingLastUserId: string | null;
  voiceHubChannelId: string | null;
  alwaysVoiceChannelId: string | null;
  logMessages: boolean;
  logMembers: boolean;
  logVoice: boolean;
  verifyRoleId: string | null;
  statsChannelId: string | null;
  birthdayChannelId: string | null;
  commandPrefix: string;
  musicMix: string[];
  /** announcement channels whose every post ZARU publishes to the servers following them */
  autoPublishChannelIds: string[];
  /** channels where every post gets its own thread */
  autoThreadChannelIds: string[];
  /** remind two hours after a DISBOARD bump */
  bumpReminderEnabled: boolean;
  bumpReminderRoleId: string | null;
  /** daily shout-out for members who joined on this date a year or more ago */
  anniversaryChannelId: string | null;
  /** staff-only channel whose threads carry modmail conversations, or null for off */
  modmailChannelId: string | null;
  modmailPingRoleId: string | null;
  /** XP for time in voice with others */
  voiceXpEnabled: boolean;
  voiceXpPerMinute: number;
  /** Monday activity digest channel, or null */
  digestChannelId: string | null;
  /** where new scheduled events and 30-minute reminders are posted, or null */
  eventReminderChannelId: string | null;
  eventReminderRoleId: string | null;
  /** ticket panel topics; empty = a single Open ticket button */
  ticketTopics: Array<{ name: string; emoji: string | null; description: string | null }>;
  /** anonymous confessions channel, or null */
  confessionChannelId: string | null;
  /** channels where chatting earns no XP */
  noXpChannelIds: string[];
  /** roles that earn chat XP faster */
  xpMultiplierRoles: Array<{ roleId: string; multiplier: number }>;
};

export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  levelsEnabled: true,
  levelUpChannelId: null,
  xpCooldownSec: 60,
  starboardEnabled: false,
  starboardChannelId: null,
  starboardMin: 3,
  ticketCategoryId: null,
  ticketLogChannelId: null,
  economyEnabled: true,
  countingChannelId: null,
  countingCurrent: 0,
  countingLastUserId: null,
  voiceHubChannelId: null,
  alwaysVoiceChannelId: null,
  logMessages: true,
  logMembers: true,
  logVoice: false,
  verifyRoleId: null,
  statsChannelId: null,
  birthdayChannelId: null,
  commandPrefix: "?",
  musicMix: [],
  autoPublishChannelIds: [],
  autoThreadChannelIds: [],
  bumpReminderEnabled: false,
  bumpReminderRoleId: null,
  anniversaryChannelId: null,
  modmailChannelId: null,
  modmailPingRoleId: null,
  voiceXpEnabled: true,
  voiceXpPerMinute: 5,
  digestChannelId: null,
  eventReminderChannelId: null,
  eventReminderRoleId: null,
  ticketTopics: [],
  confessionChannelId: null,
  noXpChannelIds: [],
  xpMultiplierRoles: [],
};

export const guildSettings = pgTable("guild_settings", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  locale: text("locale").default("en").notNull(),
  embedColor: text("embed_color").default("#E8FF47").notNull(),
  logChannelId: text("log_channel_id"),
  moduleFlags: jsonb("module_flags").$type<Record<string, boolean>>().notNull(),
  moderation: jsonb("moderation")
    .$type<ModerationConfig>()
    .default(DEFAULT_MODERATION_CONFIG)
    .notNull(),
  community: jsonb("community")
    .$type<CommunityConfig>()
    .default(DEFAULT_COMMUNITY_CONFIG)
    .notNull(),
  features: jsonb("features")
    .$type<FeatureConfig>()
    .default(DEFAULT_FEATURE_CONFIG)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inviteJoins = pgTable(
  "invite_joins",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    inviterId: text("inviter_id"),
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invite_joins_member").on(table.guildId, table.memberId),
    index("invite_joins_inviter_idx").on(table.guildId, table.inviterId),
  ],
);

export const modCaseTypeEnum = pgEnum("mod_case_type", [
  "warn",
  "mute",
  "unmute",
  "kick",
  "ban",
  "unban",
]);

export const modCases = pgTable(
  "mod_cases",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    caseNumber: integer("case_number").notNull(),
    type: modCaseTypeEnum("type").notNull(),
    targetId: text("target_id").notNull(),
    moderatorId: text("moderator_id").notNull(),
    reason: text("reason").default("No reason provided").notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mod_cases_guild_number").on(table.guildId, table.caseNumber),
    index("mod_cases_target_idx").on(table.guildId, table.targetId),
  ],
);

export const guildPermissionRoles = pgTable(
  "guild_permission_roles",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    rank: knoxRankEnum("rank").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [uniqueIndex("guild_rank_unique").on(table.guildId, table.rank)],
);

export const commandOverrides = pgTable("command_overrides", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  commandName: text("command_name").notNull(),
  allowType: allowTypeEnum("allow_type").notNull(),
  allowId: text("allow_id").notNull(),
  effect: effectEnum("effect").notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").references(() => guilds.id, { onDelete: "set null" }),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberProfiles = pgTable(
  "member_profiles",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    xp: integer("xp").default(0).notNull(),
    level: integer("level").default(0).notNull(),
    wallet: integer("wallet").default(0).notNull(),
    lastXpAt: timestamp("last_xp_at", { withTimezone: true }),
    lastDailyAt: timestamp("last_daily_at", { withTimezone: true }),
    lastWorkAt: timestamp("last_work_at", { withTimezone: true }),
    afkReason: text("afk_reason"),
    birthdayMonth: integer("birthday_month"),
    birthdayDay: integer("birthday_day"),
    /** the last year this member was wished a happy birthday, so a restart never repeats it */
    birthdayLastYear: integer("birthday_last_year"),
    /** seconds spent in voice with others, for voice XP and the voice leaderboard */
    voiceSeconds: integer("voice_seconds").default(0).notNull(),
    rep: integer("rep").default(0).notNull(),
  },
  (table) => [uniqueIndex("member_profiles_pk").on(table.guildId, table.userId)],
);

export const levelRewards = pgTable(
  "level_rewards",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [uniqueIndex("level_rewards_unique").on(table.guildId, table.level)],
);

export const customTags = pgTable(
  "custom_tags",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(),
    authorId: text("author_id").notNull(),
  },
  (table) => [uniqueIndex("custom_tags_name").on(table.guildId, table.name)],
);

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  openerId: text("opener_id").notNull(),
  claimedBy: text("claimed_by"),
  topic: text("topic"),
  reason: text("reason"),
  open: boolean("open").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const giveaways = pgTable("giveaways", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  prize: text("prize").notNull(),
  winnerCount: integer("winner_count").default(1).notNull(),
  hostId: text("host_id").notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  ended: boolean("ended").default(false).notNull(),
  entries: jsonb("entries").$type<string[]>().default([]).notNull(),
});

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  text: text("text").notNull(),
  fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
});

export const starboardMap = pgTable(
  "starboard_map",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id").notNull(),
    starMessageId: text("star_message_id").notNull(),
  },
  (table) => [uniqueIndex("starboard_source").on(table.guildId, table.sourceMessageId)],
);

export const reactionPanels = pgTable("reaction_panels", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  channelId: text("channel_id").notNull(),
  mapping: jsonb("mapping").$type<Array<{ roleId: string; label: string }>>().default([]).notNull(),
});

export const suggestions = pgTable("suggestions", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  messageId: text("message_id"),
  channelId: text("channel_id"),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** voice channels the hub created, so they can be cleaned up after a restart */
export const tempVoiceChannels = pgTable("temp_voice_channels", {
  channelId: text("channel_id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const FEED_KINDS = ["youtube", "rss", "twitch", "kick", "bluesky"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];
export const feedKindEnum = pgEnum("feed_kind", FEED_KINDS);

/** a creator or feed a channel follows: new uploads, posts and live streams are announced there */
export const feedSubscriptions = pgTable(
  "feed_subscriptions",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    kind: feedKindEnum("kind").notNull(),
    /** the UC… channel id, the feed URL, the Twitch login or the Kick slug */
    source: text("source").notNull(),
    /** display name for lists and the default message */
    label: text("label").notNull(),
    pingRoleId: text("ping_role_id"),
    /** custom message with {role} {author} {title} {url} {game} {viewers} {server}, or null for the default */
    template: text("template"),
    /** item or stream ids already announced (oldest first), so nothing is posted twice */
    seenIds: jsonb("seen_ids").$type<string[]>().default([]).notNull(),
    /** streams: whether the last check saw the channel live */
    live: boolean("live").default(false).notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** consecutive failed checks; the feed pauses itself after too many */
    failures: integer("failures").default(0).notNull(),
    paused: boolean("paused").default(false).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("feed_subscriptions_unique").on(table.guildId, table.channelId, table.kind, table.source),
    index("feed_subscriptions_guild_idx").on(table.guildId),
  ],
);

/** a note that stays at the bottom of a channel: re-posted after others write */
export const stickyMessages = pgTable("sticky_messages", {
  channelId: text("channel_id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  lastMessageId: text("last_message_id"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** DISBOARD bump reminders: when the next /bump is allowed and where to say so */
export const bumpReminders = pgTable("bump_reminders", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  channelId: text("channel_id").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
});

/** once-a-day jobs remember the last UTC date they ran per server, so a restart never repeats them */
export const dailyRuns = pgTable(
  "daily_runs",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    job: text("job").notNull(),
    lastDate: text("last_date").notNull(),
  },
  (table) => [uniqueIndex("daily_runs_pk").on(table.guildId, table.job)],
);

/** a message posted on a schedule; the job tick books the next run before sending */
export const scheduledPosts = pgTable(
  "scheduled_posts",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    content: text("content").notNull(),
    /** hourly | 6h | 12h | daily | weekly (lib/schedule.ts) */
    repeat: text("repeat").notNull(),
    /** "HH:MM" UTC anchor / time of day, or null for the default */
    atUtc: text("at_utc"),
    /** 0 (Sunday) to 6 for weekly posts, else null */
    weekday: integer("weekday"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("scheduled_posts_due_idx").on(table.nextRunAt)],
);

/** an application form staff created: up to five questions, where answers are reviewed, what accepting grants */
export const applicationForms = pgTable(
  "application_forms",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    questions: jsonb("questions").$type<string[]>().notNull(),
    reviewChannelId: text("review_channel_id").notNull(),
    roleId: text("role_id"),
    open: boolean("open").default(true).notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("application_forms_name").on(table.guildId, table.name)],
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    formId: integer("form_id")
      .notNull()
      .references(() => applicationForms.id, { onDelete: "cascade" }),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    answers: jsonb("answers").$type<string[]>().notNull(),
    /** pending | accepted | denied */
    status: text("status").default("pending").notNull(),
    reviewMessageId: text("review_message_id"),
    reviewerId: text("reviewer_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("applications_form_user_idx").on(table.formId, table.userId)],
);

/** one modmail conversation: a member and the staff thread that carries it */
export const modmailThreads = pgTable(
  "modmail_threads",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    threadId: text("thread_id").notNull(),
    open: boolean("open").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("modmail_threads_thread").on(table.threadId), index("modmail_threads_user_idx").on(table.guildId, table.userId)],
);

export const modmailBlocks = pgTable(
  "modmail_blocks",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    blockedBy: text("blocked_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("modmail_blocks_pk").on(table.guildId, table.userId)],
);

/** words a member wants a DM about when someone says them */
export const highlights = pgTable(
  "highlights",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    word: text("word").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("highlights_pk").on(table.guildId, table.userId, table.word)],
);

/** roles given for a while; the job tick takes them back */
export const tempRoles = pgTable(
  "temp_roles",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    grantedBy: text("granted_by").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("temp_roles_unique").on(table.guildId, table.userId, table.roleId), index("temp_roles_due_idx").on(table.expiresAt)],
);

/** something coins can buy: a role, or just a badge in the inventory */
export const shopItems = pgTable(
  "shop_items",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    roleId: text("role_id"),
    description: text("description"),
    /** units left, or null for unlimited */
    stock: integer("stock"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("shop_items_name").on(table.guildId, table.name)],
);

export const shopPurchases = pgTable(
  "shop_purchases",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** kept even if the item is removed from sale later */
    itemId: integer("item_id"),
    itemName: text("item_name").notNull(),
    price: integer("price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("shop_purchases_user_idx").on(table.guildId, table.userId)],
);

/** per-server, per-UTC-day activity counters, flushed from memory every job tick */
export const guildDailyStats = pgTable(
  "guild_daily_stats",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    messages: integer("messages").default(0).notNull(),
    joins: integer("joins").default(0).notNull(),
    leaves: integer("leaves").default(0).notNull(),
    voiceMinutes: integer("voice_minutes").default(0).notNull(),
  },
  (table) => [uniqueIndex("guild_daily_stats_pk").on(table.guildId, table.day)],
);

export const memberDailyMessages = pgTable(
  "member_daily_messages",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    userId: text("user_id").notNull(),
    messages: integer("messages").default(0).notNull(),
  },
  (table) => [uniqueIndex("member_daily_messages_pk").on(table.guildId, table.day, table.userId)],
);

export const channelDailyMessages = pgTable(
  "channel_daily_messages",
  {
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    channelId: text("channel_id").notNull(),
    messages: integer("messages").default(0).notNull(),
  },
  (table) => [uniqueIndex("channel_daily_messages_pk").on(table.guildId, table.day, table.channelId)],
);

/** scheduled events already reminded about, so a restart never repeats one */
export const eventReminders = pgTable("event_reminders", {
  eventId: text("event_id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  remindedAt: timestamp("reminded_at", { withTimezone: true }).defaultNow().notNull(),
});

/** a trigger phrase and the reply ZARU gives (contains | exact | starts) */
export const autoResponses = pgTable(
  "auto_responses",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    reply: text("reply").notNull(),
    match: text("match").default("contains").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("auto_responses_trigger").on(table.guildId, table.trigger)],
);

/** anonymous confessions; the author is kept so staff can act on abuse */
export const confessions = pgTable("confessions", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  messageId: text("message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** row type for the bot's in-memory cache */
export type AutoResponseRow = typeof autoResponses.$inferSelect;
