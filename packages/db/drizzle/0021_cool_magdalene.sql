CREATE TABLE "lotteries" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"pot" integer DEFAULT 0 NOT NULL,
	"ticket_price" integer DEFAULT 100 NOT NULL,
	"interval_hours" integer DEFAULT 24 NOT NULL,
	"channel_id" text,
	"draw_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tickets" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lotteries" ADD CONSTRAINT "lotteries_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_tickets" ADD CONSTRAINT "lottery_tickets_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_tickets_member" ON "lottery_tickets" USING btree ("guild_id","user_id");