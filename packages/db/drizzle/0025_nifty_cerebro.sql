CREATE TABLE "animals" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"nickname" text,
	"age" integer DEFAULT 0 NOT NULL,
	"health" integer DEFAULT 80 NOT NULL,
	"energy" integer DEFAULT 80 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animals_owner" ON "animals" USING btree ("guild_id","user_id");