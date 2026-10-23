CREATE TABLE "application_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"questions" jsonb NOT NULL,
	"review_channel_id" text NOT NULL,
	"role_id" text,
	"open" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_message_id" text,
	"reviewer_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modmail_blocks" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"blocked_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modmail_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[],"autoPublishChannelIds":[],"autoThreadChannelIds":[],"bumpReminderEnabled":false,"bumpReminderRoleId":null,"anniversaryChannelId":null,"modmailChannelId":null,"modmailPingRoleId":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modmail_blocks" ADD CONSTRAINT "modmail_blocks_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modmail_threads" ADD CONSTRAINT "modmail_threads_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_forms_name" ON "application_forms" USING btree ("guild_id","name");--> statement-breakpoint
CREATE INDEX "applications_form_user_idx" ON "applications" USING btree ("form_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modmail_blocks_pk" ON "modmail_blocks" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modmail_threads_thread" ON "modmail_threads" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "modmail_threads_user_idx" ON "modmail_threads" USING btree ("guild_id","user_id");