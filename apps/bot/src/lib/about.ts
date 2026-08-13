import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Routes,
  StringSelectMenuBuilder,
  type EmbedBuilder,
  type REST,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import { knoxEmbed } from "../interactions/embed.js";
import { logger } from "../logger.js";

/** Discord application "About Me" — max 400 characters. */
export const KNOX_APP_DESCRIPTION =
  "Knox is a Discord bot for music, moderation, levels, tickets, giveaways, and server setup. Play YouTube or Spotify in voice with a live control panel. Welcome members, track who invited them, run tickets, starboard, XP, and coins. Slash commands only. After you invite Knox, run /setup start then /help.";

export const KNOX_APP_TAGS = ["Music", "Moderation", "Levels", "Tickets", "Utility"] as const;

export const ABOUT_TOPIC_ID = "knox:about:topic";

export const ABOUT_TOPICS = [
  { value: "overview", label: "What Knox does", hint: "Full feature list and first steps" },
  { value: "setup", label: "Setup this server", hint: "Welcome, invites, autorole, templates" },
  { value: "music", label: "Music", hint: "Play YouTube in voice" },
  { value: "moderation", label: "Moderation", hint: "Warn, mute, kick, ban, automod" },
  { value: "community", label: "Community", hint: "Tickets, giveaways, starboard, tools" },
  { value: "levels", label: "Levels and coins", hint: "XP, ranks, daily, birthdays" },
  { value: "gaming", label: "Gaming", hint: "LFG, RPS, coinflip, trivia" },
] as const;

export type AboutTopic = (typeof ABOUT_TOPICS)[number]["value"];

export function dashboardUrl() {
  return process.env.KNOX_WEB_URL?.replace(/\/$/, "") || "https://knox-web-gdf2.onrender.com";
}

export function parseAboutTopic(raw: string | null | undefined): AboutTopic {
  const match = ABOUT_TOPICS.find((t) => t.value === raw);
  return match?.value ?? "overview";
}

export function aboutHelpEmbed(topic: AboutTopic, color?: string): EmbedBuilder {
  const dash = dashboardUrl();
  const embed = knoxEmbed(color);

  if (topic === "setup") {
    return embed
      .setTitle("Setup")
      .setDescription(
        "Run `/setup start` and pick channels. That one command turns Knox on for this server.",
      )
      .addFields(
        {
          name: "First command",
          value:
            "`/setup start`\n" +
            "• welcome — message when someone joins\n" +
            "• goodbye — message when they leave\n" +
            "• invites — who invited who (needs Manage Server)\n" +
            "• autorole — role given on join\n" +
            "• logs — warn / mute / kick / ban cases\n" +
            "• color — embed color, like `#E8FF47`",
        },
        {
          name: "Templates",
          value:
            "`/setup template preset:Gaming` adds channels and roles. Existing ones are skipped. Nothing is deleted.\n" +
            "`/setup view` shows what is on.\n" +
            "`/setup save-template` saves this server as a Discord template.",
        },
        {
          name: "Welcome text",
          value:
            "`{user}` `{username}` `{server}` `{membercount}` `{inviter}` `{invites}`\n" +
            "Example: `Welcome {user} to **{server}** · invited by {inviter}`",
        },
        {
          name: "Dashboard",
          value: `Automod and extra toggles: ${dash}/dashboard`,
        },
      );
  }

  if (topic === "music") {
    return embed
      .setTitle("Music")
      .setDescription("Join a voice channel, then play a song. A control panel posts in the text channel.")
      .addFields(
        {
          name: "Play",
          value:
            "`/play` — song name, YouTube, SoundCloud, or Spotify URL. Queues if something is already playing.\n" +
            "`/playnext` — jump this track to the front.\n" +
            "`/search` — pick from a list of results.",
        },
        {
          name: "Queue and panel",
          value:
            "`/queue` `/skip` `/pause` `/stop` `/nowplaying` `/leave`\n" +
            "`/remove` `/skipto` `/clear` `/shuffle` `/loop` `/volume` `/seek` `/lyrics`\n" +
            "Panel buttons: Prev, Pause, Skip, Stop, Shuffle, volume, loop, −10s / +10s, lyrics, leave.",
        },
        {
          name: "Needs",
          value: "Knox needs **Connect** and **Speak**. You must be in the same voice channel.",
        },
      );
  }

  if (topic === "moderation") {
    return embed
      .setTitle("Moderation")
      .setDescription("Every action writes a numbered case. Point `/setup logs` at a staff channel.")
      .addFields({
        name: "Commands",
        value:
          "`/warn` `/mute` `/unmute` `/kick` `/ban` `/unban`\n" +
          "`/case` — look up a case number.\n" +
          "`/history` — recent cases for a member.\n" +
          "Dashboard → Moderation: anti-invite, anti-spam, max mentions.",
      });
  }

  if (topic === "community") {
    return embed
      .setTitle("Community")
      .setDescription("Tickets, giveaways, and server tools. Most of these need a channel picked once.")
      .addFields(
        {
          name: "Staff tools",
          value:
            "`/ticket panel` — private support tickets.\n" +
            "`/giveaway start` — timed prize draw.\n" +
            "`/reactionrole` — self-assign roles.\n" +
            "`/verify` — button that gives a member role.\n" +
            "`/invites` `/invites top:true` — invite counts.",
        },
        {
          name: "Server tools",
          value:
            "`/starboard` `/logging` `/voicehub` `/counting` `/serverstats`\n" +
            "`/embed` `/tag` `/afk` `/snipe` `/poll` `/reminder` `/suggest`",
        },
      );
  }

  if (topic === "levels") {
    return embed
      .setTitle("Levels and coins")
      .setDescription("Chat earns XP. Coins come from `/eco daily` and `/eco work`.")
      .addFields({
        name: "Commands",
        value:
          "`/rank` `/levels` — XP and leaderboard.\n" +
          "`/level set` `/level reward` `/level channel` — staff XP setup.\n" +
          "`/eco balance` `/eco daily` `/eco work` `/eco pay` `/eco top`\n" +
          "`/rep` `/birthday set` `/birthday channel`",
      });
  }

  if (topic === "gaming") {
    return embed
      .setTitle("Gaming")
      .setDescription("Looking-for-group posts and a few quick games.")
      .addFields({
        name: "Commands",
        value:
          "`/lfg` — post that you need players.\n" +
          "`/fun rps` `/fun coinflip` `/fun trivia`",
      });
  }

  return embed
    .setTitle("Knox")
    .setDescription(
      "Music, moderation, levels, tickets, giveaways, and server setup. Slash commands only. Type `/` and look for Knox.",
    )
    .addFields(
      {
        name: "Do this first",
        value:
          "1. `/setup start` — welcome, goodbye, invites, autorole, logs\n" +
          "2. Join voice, then `/play` — music panel appears\n" +
          "3. `/help topic:Music` (or pick a topic below)",
      },
      {
        name: "What Knox can do",
        value:
          "**Setup** — welcome, invite tracking, autorole, channel templates\n" +
          "**Music** — YouTube / Spotify in voice, queue, lyrics, control panel\n" +
          "**Moderation** — warn, mute, kick, ban, cases, automod\n" +
          "**Community** — tickets, giveaways, starboard, reaction roles\n" +
          "**Levels** — XP, coins, rep, birthdays\n" +
          "**Gaming** — LFG, rock-paper-scissors, coinflip, trivia",
      },
      {
        name: "More",
        value: `\`/help topic:Setup\` · \`/modules\` · \`/config\`\nDashboard: ${dash}/dashboard`,
      },
    )
    .setFooter({ text: "Pick a topic in the menu for the full command list." });
}

export function introEmbed(inviter: User | null, guildName: string, color?: string) {
  const who = inviter ? `${inviter}, Knox is in **${guildName}**.` : `Knox is in **${guildName}**.`;
  return knoxEmbed(color)
    .setTitle("Knox is ready")
    .setDescription(
      `${who}\n\n` +
        "This bot runs music, moderation, levels, tickets, giveaways, and welcome/invite tracking. Slash commands only.",
    )
    .addFields(
      {
        name: "Do this first",
        value:
          "1. `/setup start` — pick welcome, goodbye, invites, autorole, and a mod-log channel\n" +
          "2. `/setup template preset:Gaming` if you want Knox to add channels and roles (nothing is deleted)\n" +
          "3. Join a voice channel and `/play` a song",
      },
      {
        name: "Useful commands",
        value:
          "`/help` — every feature, with a topic picker\n" +
          "`/invites` — who invited who (after setup)\n" +
          "`/ticket panel` — support tickets\n" +
          "`/rank` — XP from chat",
      },
      {
        name: "Permissions",
        value:
          "Invite tracking needs **Manage Server**. Music needs **Connect** and **Speak**. An Administrator invite already covers this.",
      },
      {
        name: "Dashboard",
        value: `${dashboardUrl()}/dashboard`,
      },
    )
    .setFooter({ text: "Open the menu below for setup, music, and the rest of the commands." });
}

export function aboutComponents() {
  const topics = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(ABOUT_TOPIC_ID)
      .setPlaceholder("What can Knox do?")
      .addOptions(
        ABOUT_TOPICS.map((t) => ({
          label: t.label,
          value: t.value,
          description: t.hint,
        })),
      ),
  );
  const links = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Open dashboard")
      .setURL(`${dashboardUrl()}/dashboard`),
  );
  return [topics, links];
}

export async function handleAboutSelect(interaction: StringSelectMenuInteraction) {
  const topic = parseAboutTopic(interaction.values[0]);
  await interaction.reply({
    embeds: [aboutHelpEmbed(topic)],
    ephemeral: true,
  });
}

export async function publishApplicationProfile(rest: REST) {
  if (KNOX_APP_DESCRIPTION.length > 400) {
    logger.warn({ length: KNOX_APP_DESCRIPTION.length }, "Knox About Me is over 400 characters");
  }
  try {
    await rest.patch(Routes.currentApplication(), {
      body: {
        description: KNOX_APP_DESCRIPTION.slice(0, 400),
        tags: [...KNOX_APP_TAGS],
        install_params: {
          scopes: ["bot", "applications.commands"],
          permissions: "8",
        },
      },
    });
    logger.info("Discord application profile updated");
  } catch (err) {
    logger.warn({ err }, "could not update Discord application profile");
  }
}
