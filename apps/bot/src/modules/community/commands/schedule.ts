// Recurring posts: rules reminders, weekly events, daily prompts.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, asc, count, eq } from "drizzle-orm";
import { scheduledPosts } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { REPEATS, WEEKDAYS, describeRule, nextRun, parseTimeUtc, type Repeat } from "../../../lib/schedule.js";
import { renderScheduled } from "../lib/scheduled-posts.js";

const MAX_POSTS = 10;
const TEXT_LIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;
const REPEAT_LABELS: Record<Repeat, string> = { hourly: "Every hour", "6h": "Every 6 hours", "12h": "Every 12 hours", daily: "Daily", weekly: "Weekly" };

export const scheduleCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Post a message on a schedule (rules reminders, weekly events, daily prompts)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a recurring post")
        .addChannelOption((o) => o.setName("channel").setDescription("Where to post").addChannelTypes(...TEXT_LIKE).setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("The message ({server} and {membercount} are filled in)").setRequired(true).setMaxLength(1800))
        .addStringOption((o) =>
          o
            .setName("repeat")
            .setDescription("How often")
            .setRequired(true)
            .addChoices(...REPEATS.map((r) => ({ name: REPEAT_LABELS[r], value: r }))),
        )
        .addStringOption((o) => o.setName("at").setDescription("Time of day in UTC, HH:MM (daily/weekly default 09:00; intervals align to it)").setMaxLength(5))
        .addStringOption((o) =>
          o
            .setName("weekday")
            .setDescription("For weekly posts (default: today)")
            .addChoices(...WEEKDAYS.map((name, i) => ({ name, value: String(i) }))),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Scheduled posts in this server"))
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a scheduled post")
        .addIntegerOption((o) => o.setName("number").setDescription("Number from /schedule list").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName("send")
        .setDescription("Post a scheduled message right now (the schedule is unchanged)")
        .addIntegerOption((o) => o.setName("number").setDescription("Number from /schedule list").setRequired(true).setMinValue(1)),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const channel = interaction.options.getChannel("channel", true);
      const content = interaction.options.getString("message", true).trim();
      const repeat = interaction.options.getString("repeat", true) as Repeat;
      const atRaw = interaction.options.getString("at");
      const weekdayRaw = interaction.options.getString("weekday");
      if (atRaw && !parseTimeUtc(atRaw)) {
        await interaction.reply({ content: "The time must be HH:MM in 24-hour UTC, for example 18:30.", ephemeral: true });
        return;
      }
      const [existing] = await client.db.select({ n: count() }).from(scheduledPosts).where(eq(scheduledPosts.guildId, guild.id));
      if ((existing?.n ?? 0) >= MAX_POSTS) {
        await interaction.reply({ content: `Up to ${MAX_POSTS} scheduled posts per server; remove one first.`, ephemeral: true });
        return;
      }
      const real = guild.channels.cache.get(channel.id);
      const me = guild.members.me;
      if (!real || !me || real.isThread() || !real.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        await interaction.reply({ content: `I can't post in <#${channel.id}>.`, ephemeral: true });
        return;
      }
      const rule = {
        repeat,
        atUtc: atRaw?.trim() || null,
        weekday: repeat === "weekly" ? (weekdayRaw !== null ? Number(weekdayRaw) : new Date().getUTCDay()) : null,
      };
      const first = nextRun(rule, new Date());
      const [row] = await client.db
        .insert(scheduledPosts)
        .values({ guildId: guild.id, channelId: channel.id, content, repeat, atUtc: rule.atUtc, weekday: rule.weekday, nextRunAt: first, createdBy: interaction.user.id })
        .returning();
      if (!row) return;
      const embed = knoxEmbed((await client.guildConfig.get(guild.id)).settings.embedColor)
        .setTitle(`Scheduled post #${row.id}`)
        .setDescription(`${describeRule(rule)} → <#${channel.id}>\nFirst post <t:${Math.floor(first.getTime() / 1000)}:F> (<t:${Math.floor(first.getTime() / 1000)}:R>)`)
        .addFields({ name: "Message", value: content.slice(0, 1024) });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === "list") {
      const rows = await client.db.select().from(scheduledPosts).where(eq(scheduledPosts.guildId, guild.id)).orderBy(asc(scheduledPosts.id));
      if (!rows.length) {
        await interaction.reply({ content: "Nothing scheduled yet. Try /schedule add.", ephemeral: true });
        return;
      }
      const lines = rows.map(
        (r) =>
          `**#${r.id}** ${describeRule({ repeat: r.repeat as Repeat, atUtc: r.atUtc, weekday: r.weekday })} → <#${r.channelId}> · next <t:${Math.floor(r.nextRunAt.getTime() / 1000)}:R>\n> ${r.content.replace(/\s+/g, " ").slice(0, 80)}${r.content.length > 80 ? "…" : ""}`,
      );
      const embed = knoxEmbed((await client.guildConfig.get(guild.id)).settings.embedColor)
        .setTitle(`Scheduled posts (${rows.length}/${MAX_POSTS})`)
        .setDescription(lines.join("\n").slice(0, 4000));
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const number = interaction.options.getInteger("number", true);
    const [row] = await client.db
      .select()
      .from(scheduledPosts)
      .where(and(eq(scheduledPosts.guildId, guild.id), eq(scheduledPosts.id, number)))
      .limit(1);
    if (!row) {
      await interaction.reply({ content: `No scheduled post #${number} here. See /schedule list.`, ephemeral: true });
      return;
    }
    if (sub === "remove") {
      await client.db.delete(scheduledPosts).where(eq(scheduledPosts.id, row.id));
      await interaction.reply({ content: `Scheduled post #${row.id} removed.`, ephemeral: true });
      return;
    }
    const channel = await guild.channels.fetch(row.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: `I can't post in <#${row.channelId}> any more.`, ephemeral: true });
      return;
    }
    await channel.send({ content: renderScheduled(row.content, guild), allowedMentions: { parse: ["everyone", "roles", "users"] } });
    await interaction.reply({ content: `Posted #${row.id} in <#${row.channelId}>. Its schedule is unchanged.`, ephemeral: true });
  },
};
