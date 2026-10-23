CREATE TABLE "auto_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"trigger" text NOT NULL,
	"reply" text NOT NULL,
	"match" text DEFAULT 'contains' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "moderation" SET DEFAULT '{"antiInvite":true,"antiSpam":true,"maxMentions":5,"ignoredChannelIds":[],"antiPhishing":true,"joinGateMinAccountAgeHours":0,"joinGateRequireAvatar":false,"raidJoinsPerMinute":0,"raidMode":false,"raidModeUntil":null,"autoDecancer":false,"lockdownChannelIds":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "community" SET DEFAULT '{"welcomeEnabled":false,"welcomeChannelId":null,"welcomeMessage":"Welcome {user} to **{server}**! Invited by {inviter} · {invites} invites.","goodbyeEnabled":false,"goodbyeChannelId":null,"goodbyeMessage":"**{username}** left {server}. We are now {membercount} members.","invitesEnabled":false,"invitesChannelId":null,"autoRoleId":null,"welcomeCardEnabled":false,"welcomeDmMessage":null}'::jsonb;--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[],"autoPublishChannelIds":[],"autoThreadChannelIds":[],"bumpReminderEnabled":false,"bumpReminderRoleId":null,"anniversaryChannelId":null,"modmailChannelId":null,"modmailPingRoleId":null,"voiceXpEnabled":true,"voiceXpPerMinute":5,"digestChannelId":null,"eventReminderChannelId":null,"eventReminderRoleId":null,"ticketTopics":[],"confessionChannelId":null,"noXpChannelIds":[],"xpMultiplierRoles":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD CONSTRAINT "auto_responses_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confessions" ADD CONSTRAINT "confessions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_responses_trigger" ON "auto_responses" USING btree ("guild_id","trigger");