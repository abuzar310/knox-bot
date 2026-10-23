// Anonymous confessions: /confess posts without a name; staff can look an entry up if it crosses a line.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { confessions } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

const COOLDOWN_MS = 5 * 60_000;

export const confessCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Post something anonymously in the confessions channel")
    .addStringOption((o) => o.setName("message").setDescription("Your confession").setRequired(true).setMaxLength(1500)),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const cached = await client.guildConfig.get(guild.id);
    const channelId = cached.settings.features.confessionChannelId;
    if (!channelId) {
      await interaction.reply({ content: "This server has no confessions channel.", ephemeral: true });
      return;
    }
    const key = `${guild.id}:${interaction.user.id}`;
    const last = client.confessCooldown.get(key) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      await interaction.reply({ content: "One confession every 5 minutes. Take a breath.", ephemeral: true });
      return;
    }
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: "The confessions channel is gone; tell an admin.", ephemeral: true });
      return;
    }
    const content = interaction.options.getString("message", true).trim();
    client.confessCooldown.set(key, Date.now());
    const [row] = await client.db.insert(confessions).values({ guildId: guild.id, userId: interaction.user.id, content }).returning();
    if (!row) return;
    const sent = await channel
      .send({ embeds: [knoxEmbed(cached.settings.embedColor).setTitle(`Confession #${row.id}`).setDescription(content).setFooter({ text: "/confess to add yours · anonymous to members, not to staff" })], allowedMentions: { parse: [] } })
      .catch(() => null);
    if (sent) await client.db.update(confessions).set({ messageId: sent.id }).where(eq(confessions.id, row.id));
    await interaction.reply({ content: sent ? `Posted anonymously as confession #${row.id}.` : "I couldn't post in the confessions channel.", ephemeral: true });
  },
};

export const confessionCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("confession")
    .setDescription("Confessions channel settings and staff lookup")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Where confessions are posted")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(ChannelType.GuildText).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Switch confessions off"))
    .addSubcommand((s) =>
      s
        .setName("lookup")
        .setDescription("Who posted a confession (staff only, for abuse)")
        .addIntegerOption((o) => o.setName("number").setDescription("Confession number").setRequired(true).setMinValue(1)),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const sub = interaction.options.getSubcommand();
    if (sub === "lookup") {
      const number = interaction.options.getInteger("number", true);
      const [row] = await ctx.client.db.select().from(confessions).where(and(eq(confessions.guildId, guild.id), eq(confessions.id, number))).limit(1);
      await interaction.reply({
        content: row ? `Confession #${row.id} was posted by <@${row.userId}> <t:${Math.floor(row.createdAt.getTime() / 1000)}:R>.` : `No confession #${number} here.`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
      return;
    }
    const channelId = sub === "channel" ? interaction.options.getChannel("channel", true).id : null;
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, features: { ...cached.settings.features, confessionChannelId: channelId } });
    await interaction.reply({ content: channelId ? `Confessions go to <#${channelId}>. Members use /confess; staff can /confession lookup a number if needed.` : "Confessions are off.", ephemeral: true });
  },
};
