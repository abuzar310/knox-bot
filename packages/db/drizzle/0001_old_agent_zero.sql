CREATE TYPE "public"."mod_case_type" AS ENUM('warn', 'mute', 'unmute', 'kick', 'ban', 'unban');--> statement-breakpoint
CREATE TABLE "mod_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"case_number" integer NOT NULL,
	"type" "mod_case_type" NOT NULL,
	"target_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"reason" text DEFAULT 'No reason provided' NOT NULL,
	"duration_ms" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "moderation" jsonb DEFAULT '{"antiInvite":true,"antiSpam":true,"maxMentions":5,"ignoredChannelIds":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "mod_cases" ADD CONSTRAINT "mod_cases_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_cases_guild_number" ON "mod_cases" USING btree ("guild_id","case_number");--> statement-breakpoint
CREATE INDEX "mod_cases_target_idx" ON "mod_cases" USING btree ("guild_id","target_id");