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
};

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  antiInvite: true,
  antiSpam: true,
  maxMentions: 5,
  ignoredChannelIds: [],
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
};

export const DEFAULT_COMMUNITY_CONFIG: CommunityConfig = {
  welcomeEnabled: false,
  welcomeChannelId: null,
  welcomeMessage:
    "Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.",
  goodbyeEnabled: false,
  goodbyeChannelId: null,
  goodbyeMessage: "**{username}** left {server}. We're now {membercount} members.",
  invitesEnabled: false,
  invitesChannelId: null,
  autoRoleId: null,
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
  logMessages: boolean;
  logMembers: boolean;
  logVoice: boolean;
  verifyRoleId: string | null;
  statsChannelId: string | null;
  birthdayChannelId: string | null;
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
  logMessages: true,
  logMembers: true,
  logVoice: false,
  verifyRoleId: null,
  statsChannelId: null,
  birthdayChannelId: null,
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
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
