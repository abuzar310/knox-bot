ALTER TABLE "modmail_threads" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "modmail_threads" ADD COLUMN "status_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "modmail_threads" ADD COLUMN "reminded_at" timestamp with time zone;