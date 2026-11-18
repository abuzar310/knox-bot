ALTER TABLE "mod_cases" ADD COLUMN "source" text DEFAULT 'command' NOT NULL;--> statement-breakpoint
ALTER TABLE "mod_cases" ADD COLUMN "audit_entry_id" text;--> statement-breakpoint
ALTER TABLE "mod_cases" ADD COLUMN "evidence" text;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_cases_guild_audit_entry" ON "mod_cases" USING btree ("guild_id","audit_entry_id");