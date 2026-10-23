CREATE TABLE "channel_daily_messages" (
	"guild_id" text NOT NULL,
	"day" text NOT NULL,
	"channel_id" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reminders" (
	"event_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"reminded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_daily_stats" (
	"guild_id" text NOT NULL,
	"day" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"joins" integer DEFAULT 0 NOT NULL,
	"leaves" integer DEFAULT 0 NOT NULL,
	"voice_minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_daily_messages" (
	"guild_id" text NOT NULL,
	"day" text NOT NULL,
	"user_id" text NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[],"autoPublishChannelIds":[],"autoThreadChannelIds":[],"bumpReminderEnabled":false,"bumpReminderRoleId":null,"anniversaryChannelId":null,"modmailChannelId":null,"modmailPingRoleId":null,"voiceXpEnabled":true,"voiceXpPerMinute":5,"digestChannelId":null,"eventReminderChannelId":null,"eventReminderRoleId":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "channel_daily_messages" ADD CONSTRAINT "channel_daily_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_daily_stats" ADD CONSTRAINT "guild_daily_stats_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_daily_messages" ADD CONSTRAINT "member_daily_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_daily_messages_pk" ON "channel_daily_messages" USING btree ("guild_id","day","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_daily_stats_pk" ON "guild_daily_stats" USING btree ("guild_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "member_daily_messages_pk" ON "member_daily_messages" USING btree ("guild_id","day","user_id");