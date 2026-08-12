CREATE TABLE "invite_joins" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"member_id" text NOT NULL,
	"inviter_id" text,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "community" jsonb DEFAULT '{"welcomeEnabled":false,"welcomeChannelId":null,"welcomeMessage":"Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.","goodbyeEnabled":false,"goodbyeChannelId":null,"goodbyeMessage":"**{username}** left {server}. We''re now {membercount} members.","invitesEnabled":false,"invitesChannelId":null,"autoRoleId":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invite_joins" ADD CONSTRAINT "invite_joins_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_joins_member" ON "invite_joins" USING btree ("guild_id","member_id");--> statement-breakpoint
CREATE INDEX "invite_joins_inviter_idx" ON "invite_joins" USING btree ("guild_id","inviter_id");