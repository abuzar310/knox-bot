CREATE TABLE "quarantine_appeals" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"quarantine_id" integer,
	"case_number" integer,
	"what_happened" text NOT NULL,
	"why_lift" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"review_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decided_note" text
);
--> statement-breakpoint
ALTER TABLE "quarantine_config" ADD COLUMN "appeal_form_message_id" text;--> statement-breakpoint
ALTER TABLE "quarantine_appeals" ADD CONSTRAINT "quarantine_appeals_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quarantine_appeals_one_open" ON "quarantine_appeals" USING btree ("guild_id","user_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "quarantine_appeals_user_idx" ON "quarantine_appeals" USING btree ("guild_id","user_id");