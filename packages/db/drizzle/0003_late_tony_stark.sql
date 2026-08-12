CREATE TABLE "custom_tags" (
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"author_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"prize" text NOT NULL,
	"winner_count" integer DEFAULT 1 NOT NULL,
	"host_id" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"level" integer NOT NULL,
	"role_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"wallet" integer DEFAULT 0 NOT NULL,
	"last_xp_at" timestamp with time zone,
	"last_daily_at" timestamp with time zone,
	"last_work_at" timestamp with time zone,
	"afk_reason" text,
	"birthday_month" integer,
	"birthday_day" integer,
	"rep" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_panels" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"message_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"mapping" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"text" text NOT NULL,
	"fire_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starboard_map" (
	"guild_id" text NOT NULL,
	"source_message_id" text NOT NULL,
	"star_message_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"message_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"opener_id" text NOT NULL,
	"claimed_by" text,
	"open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "features" jsonb DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_tags" ADD CONSTRAINT "custom_tags_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction_panels" ADD CONSTRAINT "reaction_panels_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starboard_map" ADD CONSTRAINT "starboard_map_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_tags_name" ON "custom_tags" USING btree ("guild_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "level_rewards_unique" ON "level_rewards" USING btree ("guild_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "member_profiles_pk" ON "member_profiles" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "starboard_source" ON "starboard_map" USING btree ("guild_id","source_message_id");