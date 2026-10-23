// The "here is what I understand about your server" post, with the buttons that act on it.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Guild } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { analyzeServer, channelsFor, type Analysis, PURPOSES, type Purpose } from "../../../lib/server-brain.js";
import { scanGuild, type ServerSnapshot } from "../../../lib/server-scan.js";

export const SETUP_AUTO_ID = "knox:setup:auto";
export const TIDY_ID = "knox:setup:tidy";
const BRAIN_TTL_MS = 60 * 60_000;

export type Brain = { snapshot: ServerSnapshot; analysis: Analysis; at: number };

/** scans and analyses, remembering the result for an hour so the buttons can act on it */
export async function thinkAbout(client: KnoxClient, guild: Guild, force = false): Promise<Brain> {
  const cached = client.serverBrain.get(guild.id);
  if (cached && !force && Date.now() - cached.at < BRAIN_TTL_MS) return cached;
  const snapshot = await scanGuild(guild);
  const analysis = await analyzeServer(snapshot);
  const brain: Brain = { snapshot, analysis, at: Date.now() };
  client.serverBrain.set(guild.id, brain);
  return brain;
}

const LABEL: Record<Purpose, string> = {
  welcome: "Welcome",
  rules: "Rules",
  announcements: "Announcements",
  general: "General chat",
  logs: "Logs",
  staff: "Staff",
  support: "Support",
  suggestions: "Suggestions",
  media: "Media",
  "bot-commands": "Bot commands",
  introductions: "Introductions",
  events: "Events",
  music: "Music",
  voice: "Voice",
  other: "Other",
};

export function reportMessage(guild: Guild, brain: Brain, color: string, extraLines: string[] = []) {
  const { snapshot, analysis } = brain;
  const groups: string[] = [];
  for (const purpose of PURPOSES) {
    const list = channelsFor(snapshot, analysis, purpose, ["text", "announcement", "forum", "voice", "stage"]);
    if (!list.length || purpose === "voice") continue;
    groups.push(`**${LABEL[purpose]}:** ${list.slice(0, 6).map((c) => `<#${c.id}>`).join(" ")}${list.length > 6 ? ` +${list.length - 6}` : ""}`);
  }
  const voice = snapshot.channels.filter((c) => c.kind === "voice" || c.kind === "stage").length;
  const staff = analysis.staffRoleIds.slice(0, 6).map((id) => `<@&${id}>`).join(" ");
  const embed = knoxEmbed(color)
    .setTitle(`What I understand about ${guild.name}`)
    .setDescription(
      [
        analysis.summary || `${snapshot.memberCount.toLocaleString()} members, ${snapshot.channels.length} channels in ${snapshot.categories.length} categories, ${snapshot.roles.length} roles.`,
        "",
        ...groups,
        voice ? `**Voice:** ${voice} channel${voice === 1 ? "" : "s"}` : "",
        staff ? `**Staff roles:** ${staff}` : "**Staff roles:** none found",
        snapshot.bots.length ? `**Other bots:** ${snapshot.bots.slice(0, 8).join(", ")}${snapshot.bots.length > 8 ? "…" : ""}` : "",
        snapshot.automodRules.length ? `**Discord AutoMod:** ${snapshot.automodRules.length} rule${snapshot.automodRules.length === 1 ? "" : "s"}` : "",
        ...extraLines,
      ]
        .filter((l) => l !== "")
        .join("\n")
        .slice(0, 4000),
    )
    .setFooter({ text: `${analysis.source === "ai" ? "Read with AI" : "Read with rules"} · ${snapshot.channels.length} channels · ${snapshot.roles.length} roles` });
  if (analysis.issues.length) embed.addFields({ name: "What I'd fix", value: analysis.issues.map((i) => `• ${i}`).join("\n").slice(0, 1024) });
  if (analysis.tidy.length) {
    const creates = analysis.tidy.filter((t) => t.action === "create_channel").map((t) => `create #${t.action === "create_channel" ? t.name : ""}`);
    const moves = analysis.tidy.filter((t) => t.action === "categorize").length;
    embed.addFields({ name: "Tidy-up plan", value: [...creates, moves ? `put ${moves} stray channel${moves === 1 ? "" : "s"} under categories` : ""].filter(Boolean).join(", ").slice(0, 1024) });
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(SETUP_AUTO_ID).setLabel("Set up everything").setStyle(ButtonStyle.Success).setEmoji("⚡"),
  );
  if (analysis.tidy.length) row.addComponents(new ButtonBuilder().setCustomId(TIDY_ID).setLabel("Tidy up channels").setStyle(ButtonStyle.Primary).setEmoji("🧹"));
  return { embeds: [embed], components: [row] };
}
