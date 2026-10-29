CREATE TABLE "sticky_roles" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_ids" jsonb NOT NULL,
	"left_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sticky_roles_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ALTER COLUMN "features" SET DEFAULT '{"levelsEnabled":true,"levelUpChannelId":null,"xpCooldownSec":60,"starboardEnabled":false,"starboardChannelId":null,"starboardMin":3,"ticketCategoryId":null,"ticketLogChannelId":null,"maxOpenTicketsPerUser":1,"ticketSoftClose":false,"economyEnabled":true,"countingChannelId":null,"countingCurrent":0,"countingLastUserId":null,"voiceHubChannelId":null,"alwaysVoiceChannelId":null,"logMessages":true,"logMembers":true,"logVoice":false,"verifyRoleId":null,"statsChannelId":null,"birthdayChannelId":null,"commandPrefix":"?","musicMix":[],"autoPublishChannelIds":[],"autoThreadChannelIds":[],"bumpReminderEnabled":false,"bumpReminderRoleId":null,"anniversaryChannelId":null,"modmailChannelId":null,"modmailPingRoleId":null,"voiceXpEnabled":true,"voiceXpPerMinute":5,"digestChannelId":null,"eventReminderChannelId":null,"eventReminderRoleId":null,"ticketTopics":[],"confessionChannelId":null,"noXpChannelIds":[],"xpMultiplierRoles":[],"rulesChannelId":null,"announcementsChannelId":null,"brainReportAt":null,"protectedRoleIds":[],"moneyLogChannelId":null,"startBankBalance":0,"maxWalletBalance":0,"maxBankBalance":0}'::jsonb;--> statement-breakpoint
ALTER TABLE "sticky_roles" ADD CONSTRAINT "sticky_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;