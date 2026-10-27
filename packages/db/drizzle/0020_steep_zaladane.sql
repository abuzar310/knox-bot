CREATE TABLE "guild_income_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "last_collect_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guild_income_roles" ADD CONSTRAINT "guild_income_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guild_income_roles_role" ON "guild_income_roles" USING btree ("guild_id","role_id");