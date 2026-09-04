import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Routes,
  StringSelectMenuBuilder,
  type Client,
  type EmbedBuilder,
  type Guild,
  type REST,
  type StringSelectMenuInteraction,
  type User,
} from "discord.js";
import { BRAND } from "@knox/shared";
import { knoxEmbed } from "../interactions/embed.js";
import { logger } from "../logger.js";

const NAME = BRAND.name;

/** Discord application "About Me" — max 400 characters. */
export const KNOX_APP_DESCRIPTION =
  `${NAME} is a Discord bot for music, moderation, levels, tickets, giveaways, and server setup. Play YouTube or Spotify in voice with a live control panel. Welcome members, track who invited them, run tickets, starboard, XP, and coins. Slash commands and z! prefix (change with /prefix). After invite: /setup start or z!setup start, then /help.`;

export const KNOX_APP_TAGS = ["Music", "Moderation", "Levels", "Tickets", "Utility"] as const;

export const ABOUT_TOPIC_ID = "knox:about:topic";

export const ABOUT_TOPICS = [
  { value: "overview", label: `What ${NAME} does`, hint: "Full feature list and first steps" },
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
        "Run `/setup start` and pick channels. That one command turns this bot on for this server.",
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
            "`/play` `/p` `z!play` `z!p` — song name, YouTube, SoundCloud, or Spotify URL. Queues if something is already playing.\n" +
            "`/playnext` — jump this track to the front.\n" +
            "`/playskip` — skip now and play this instead.\n" +
            "`/search` — pick from a list of results.",
        },
        {
          name: "Queue and panel",
          value:
            "`/queue` `/q` `/skip` `/pause` `/stop` `/nowplaying` `/np` `/join` `/leave`\n" +
            "`/remove` `/move` `/removedupes` `/skipto` `/clear` `/shuffle` `/loop` `/volume` `/seek` `/lyrics`\n" +
            "Panel buttons: Prev, Pause, Skip, Stop, Shuffle, volume, loop, −10s / +10s, lyrics, leave.",
        },
        {
          name: "Needs",
          value: `${NAME} needs **Connect** and **Speak**. You must be in the same voice channel.`,
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
    .setTitle(NAME)
    .setDescription(
      `Music, moderation, levels, tickets, giveaways, and server setup. Slash commands and a text prefix (default \`z!\`).`,
    )
    .addFields(
      {
        name: "Do this first",
        value:
          "1. `/setup start` or `z!setup start` — welcome, goodbye, invites, autorole, logs\n" +
          "2. Join voice, then `/play` or `z!play` — music panel appears\n" +
          "3. `/help` · `z!help` · `/prefix` to change `z!`",
      },
      {
        name: `What ${NAME} can do`,
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
  const who = inviter ? `${inviter}, ${NAME} is in **${guildName}**.` : `${NAME} is in **${guildName}**.`;
  return knoxEmbed(color)
    .setTitle(`${NAME} is ready`)
    .setDescription(
      `${who}\n\n` +
        "This bot runs music, moderation, levels, tickets, giveaways, and welcome/invite tracking. Slash commands and `z!` prefix.",
    )
    .addFields(
      {
        name: "Do this first",
        value:
          "1. `/setup start` or `z!setup start` — welcome, goodbye, invites, autorole, logs\n" +
          "2. `/setup template Gaming` if you want channels and roles added (nothing is deleted)\n" +
          "3. Join voice and `/play` or `z!play` a song",
      },
      {
        name: "Useful commands",
        value:
          "`/help` `z!help` — every feature, with a topic picker\n" +
          "`/prefix` `z!prefix` — show or change the text prefix\n" +
          "`/play` `z!play` — music · `/invites` · `/ticket panel` · `/rank`",
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
      .setPlaceholder(`What can ${NAME} do?`)
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

function logoPath() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../assets/zaru.png");
}

async function readLogo() {
  try {
    return await readFile(logoPath());
  } catch {
    return null;
  }
}

export async function publishApplicationProfile(rest: REST) {
  if (KNOX_APP_DESCRIPTION.length > 400) {
    logger.warn({ length: KNOX_APP_DESCRIPTION.length }, "About Me is over 400 characters");
  }
  const logo = await readLogo();
  try {
    await rest.patch(Routes.currentApplication(), {
      body: {
        name: NAME,
        description: KNOX_APP_DESCRIPTION.slice(0, 400),
        tags: [...KNOX_APP_TAGS],
        install_params: {
          scopes: ["bot", "applications.commands"],
          permissions: "8",
        },
        ...(logo ? { icon: `data:image/png;base64,${logo.toString("base64")}` } : {}),
      },
    });
    logger.info({ name: NAME }, "Discord application profile updated");
  } catch (err) {
    logger.warn({ err }, "could not update Discord application profile");
  }
}

export async function applyBotDisplayName(client: Client) {
  const user = client.user;
  if (user && user.username !== NAME) {
    try {
      await user.setUsername(NAME);
      logger.info({ name: NAME }, "Discord username updated");
    } catch (err) {
      logger.warn({ err }, "could not set Discord username — change it in the Developer Portal if this name is taken");
    }
  }

  const logo = await readLogo();
  if (user && logo) {
    try {
      await user.setAvatar(logo);
      logger.info("Discord avatar updated");
    } catch (err) {
      logger.warn({ err }, "could not set Discord avatar");
    }
  }

  for (const guild of client.guilds.cache.values()) {
    await applyGuildNickname(guild);
  }
}

export async function applyGuildNickname(guild: Guild) {
  try {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const nick = me.nickname;
    if (nick === NAME) return;
    if (nick && nick !== "Knox") return;
    await me.setNickname(NAME);
  } catch {
    // Missing Change Nickname, or Discord rate-limited the rename.
  }
}
