ALTER TABLE "member_profiles" ADD COLUMN "bank" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "last_fish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "last_hunt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "last_crime_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "last_rob_at" timestamp with time zone;