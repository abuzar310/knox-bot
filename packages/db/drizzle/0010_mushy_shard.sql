ALTER TYPE "public"."feed_kind" ADD VALUE 'bluesky';--> statement-breakpoint
CREATE TABLE "highlights" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"word" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"granted_by" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[],"autoPublishChannelIds":[],"autoThreadChannelIds":[],"bumpReminderEnabled":false,"bumpReminderRoleId":null,"anniversaryChannelId":null,"modmailChannelId":null,"modmailPingRoleId":null,"voiceXpEnabled":true,"voiceXpPerMinute":5}'::jsonb;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "voice_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temp_roles" ADD CONSTRAINT "temp_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "highlights_pk" ON "highlights" USING btree ("guild_id","user_id","word");--> statement-breakpoint
CREATE UNIQUE INDEX "temp_roles_unique" ON "temp_roles" USING btree ("guild_id","user_id","role_id");--> statement-breakpoint
CREATE INDEX "temp_roles_due_idx" ON "temp_roles" USING btree ("expires_at");