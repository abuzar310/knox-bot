CREATE TYPE "public"."feed_kind" AS ENUM('youtube', 'rss', 'twitch', 'kick');--> statement-breakpoint
CREATE TABLE "feed_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"kind" "feed_kind" NOT NULL,
	"source" text NOT NULL,
	"label" text NOT NULL,
	"ping_role_id" text,
	"template" text,
	"seen_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[],"autoPublishChannelIds":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "feed_subscriptions" ADD CONSTRAINT "feed_subscriptions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_subscriptions_unique" ON "feed_subscriptions" USING btree ("guild_id","channel_id","kind","source");--> statement-breakpoint
CREATE INDEX "feed_subscriptions_guild_idx" ON "feed_subscriptions" USING btree ("guild_id");