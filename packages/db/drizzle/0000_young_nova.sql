CREATE TYPE "public"."allow_type" AS ENUM('role', 'user');--> statement-breakpoint
CREATE TYPE "public"."effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."knox_rank" AS ENUM('owner', 'admin', 'mod', 'dj', 'member');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"command_name" text NOT NULL,
	"allow_type" "allow_type" NOT NULL,
	"allow_id" text NOT NULL,
	"effect" "effect" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_permission_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"rank" "knox_rank" NOT NULL,
	"role_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"embed_color" text DEFAULT '#E8FF47' NOT NULL,
	"log_channel_id" text,
	"module_flags" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"owner_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"premium" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_overrides" ADD CONSTRAINT "command_overrides_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_permission_roles" ADD CONSTRAINT "guild_permission_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guild_rank_unique" ON "guild_permission_roles" USING btree ("guild_id","rank");