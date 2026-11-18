ALTER TYPE "public"."mod_case_type" ADD VALUE 'quarantine';--> statement-breakpoint
ALTER TYPE "public"."mod_case_type" ADD VALUE 'unquarantine';--> statement-breakpoint
CREATE TABLE "quarantine_config" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"appeal_channel_id" text,
	"review_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantines" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"case_number" integer,
	"until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quarantine_config" ADD CONSTRAINT "quarantine_config_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantines" ADD CONSTRAINT "quarantines_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quarantines_guild_user" ON "quarantines" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "quarantines_until_idx" ON "quarantines" USING btree ("until");