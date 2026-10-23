import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, asc, count, eq } from "drizzle-orm";
import { autoResponses } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { MATCHES, MAX_RESPONSES, normalizeTrigger, reloadGuildAutoResponses, type MatchKind } from "../lib/auto-responses.js";

export const autoResponseCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("autoresponse")
    .setDescription("Reply automatically when someone says a word or phrase")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a trigger and its reply")
        .addStringOption((o) => o.setName("trigger").setDescription("Word or phrase").setRequired(true).setMaxLength(100))
        .addStringOption((o) => o.setName("reply").setDescription("The reply; {user} {username} {server} are filled in").setRequired(true).setMaxLength(1000))
        .addStringOption((o) =>
          o
            .setName("match")
            .setDescription("How to match (default: message contains the trigger)")
            .addChoices({ name: "contains", value: "contains" }, { name: "exact message", value: "exact" }, { name: "starts with", value: "starts" }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a trigger")
        .addStringOption((o) => o.setName("trigger").setDescription("The trigger").setRequired(true).setMaxLength(100)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("All auto-responses")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const rows = await client.db.select().from(autoResponses).where(eq(autoResponses.guildId, guild.id)).orderBy(asc(autoResponses.trigger));
      if (!rows.length) {
        await interaction.reply({ content: "No auto-responses yet. Try /autoresponse add.", ephemeral: true });
        return;
      }
      const lines = rows.map((r) => `**${r.trigger}** (${r.match}) → ${r.reply.replace(/\s+/g, " ").slice(0, 80)}${r.reply.length > 80 ? "…" : ""}`);
      await interaction.reply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle(`Auto-responses (${rows.length}/${MAX_RESPONSES})`).setDescription(lines.join("\n").slice(0, 4000))], ephemeral: true });
      return;
    }
    const trigger = normalizeTrigger(interaction.options.getString("trigger", true));
    if (trigger.length < 2) {
      await interaction.reply({ content: "Triggers need at least 2 characters.", ephemeral: true });
      return;
    }
    if (sub === "remove") {
      const removed = await client.db.delete(autoResponses).where(and(eq(autoResponses.guildId, guild.id), eq(autoResponses.trigger, trigger))).returning({ id: autoResponses.id });
      await reloadGuildAutoResponses(client, guild.id);
      await interaction.reply({ content: removed.length ? `Removed **${trigger}**.` : `No auto-response for **${trigger}**.`, ephemeral: true });
      return;
    }
    const [existing] = await client.db.select({ n: count() }).from(autoResponses).where(eq(autoResponses.guildId, guild.id));
    if ((existing?.n ?? 0) >= MAX_RESPONSES) {
      await interaction.reply({ content: `Up to ${MAX_RESPONSES} auto-responses; remove one first.`, ephemeral: true });
      return;
    }
    const match = (interaction.options.getString("match") ?? "contains") as MatchKind;
    if (!MATCHES.includes(match)) return;
    const reply = interaction.options.getString("reply", true).trim();
    const [row] = await client.db
      .insert(autoResponses)
      .values({ guildId: guild.id, trigger, reply, match, createdBy: interaction.user.id })
      .onConflictDoUpdate({ target: [autoResponses.guildId, autoResponses.trigger], set: { reply, match, createdBy: interaction.user.id } })
      .returning();
    await reloadGuildAutoResponses(client, guild.id);
    await interaction.reply({ content: `When a message ${match === "exact" ? "is exactly" : match === "starts" ? "starts with" : "contains"} **${row?.trigger ?? trigger}**, ZARU replies with your text (once per 10 s per channel).`, ephemeral: true });
  },
};
