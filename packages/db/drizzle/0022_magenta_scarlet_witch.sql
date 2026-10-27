CREATE TABLE "shop_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"effect" integer DEFAULT 0 NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "rob_shield_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "xp_boost_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "xp_boost_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_items" ADD COLUMN "type" text DEFAULT 'badge' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_items" ADD COLUMN "effect" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_inventory" ADD CONSTRAINT "shop_inventory_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_inventory_item" ON "shop_inventory" USING btree ("guild_id","user_id","name");