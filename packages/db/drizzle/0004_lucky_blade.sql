CREATE TABLE "temp_voice_channels" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "community" SET DEFAULT '{"welcomeEnabled":false,"welcomeChannelId":null,"welcomeMessage":"Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.","goodbyeEnabled":false,"goodbyeChannelId":null,"goodbyeMessage":"**{username}** left {server}. We are now {membercount} members.","invitesEnabled":false,"invitesChannelId":null,"autoRoleId":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD COLUMN "birthday_last_year" integer;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "channel_id" text;--> statement-breakpoint
ALTER TABLE "temp_voice_channels" ADD CONSTRAINT "temp_voice_channels_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;