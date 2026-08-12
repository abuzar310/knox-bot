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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
