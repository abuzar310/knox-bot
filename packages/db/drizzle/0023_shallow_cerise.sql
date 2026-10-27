ALTER TABLE "giveaways" ADD COLUMN "required_role_id" text;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "bonus_role_id" text;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "bonus_entries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "giveaways" ADD COLUMN "min_account_days" integer DEFAULT 0 NOT NULL;