// /applyform manages forms (staff); /apply fills one in (anyone).
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { applicationForms, applications } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";
import { MAX_QUESTIONS, MAX_QUESTION_LENGTH, appId, findForm, openApplication } from "../lib/applications.js";

const MAX_FORMS = 10;
const TEXT_LIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

const nameOption = (s: SlashCommandSubcommandBuilder) =>
  s.addStringOption((o) => o.setName("name").setDescription("Form name (from /applyform list)").setRequired(true).setMaxLength(32));

export const applyFormCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("applyform")
    .setDescription("Application forms: staff, event helpers, partners… answered in a pop-up, reviewed with buttons")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => {
      s.setName("create")
        .setDescription("Create a form (up to five questions)")
        .addStringOption((o) => o.setName("name").setDescription("Short name, e.g. staff").setRequired(true).setMaxLength(32))
        .addChannelOption((o) => o.setName("review_channel").setDescription("Where answers are posted for staff").addChannelTypes(...TEXT_LIKE).setRequired(true))
        .addStringOption((o) => o.setName("question1").setDescription(`First question (max ${MAX_QUESTION_LENGTH} characters)`).setRequired(true).setMaxLength(MAX_QUESTION_LENGTH));
      for (let i = 2; i <= MAX_QUESTIONS; i++) {
        s.addStringOption((o) => o.setName(`question${i}`).setDescription(`Question ${i}`).setMaxLength(MAX_QUESTION_LENGTH));
      }
      return s.addRoleOption((o) => o.setName("role").setDescription("Role given when an application is accepted"));
    })
    .addSubcommand((s) => s.setName("list").setDescription("Forms in this server"))
    .addSubcommand((s) =>
      nameOption(s.setName("panel").setDescription("Post an Apply button for a form")).addChannelOption((o) =>
        o.setName("channel").setDescription("Where to post (default: here)").addChannelTypes(...TEXT_LIKE),
      ),
    )
    .addSubcommand((s) => nameOption(s.setName("open").setDescription("Start taking applications")))
    .addSubcommand((s) => nameOption(s.setName("close").setDescription("Stop taking applications (existing ones stay)")))
    .addSubcommand((s) => nameOption(s.setName("delete").setDescription("Delete a form and its applications")))
    .addSubcommand((s) => s.setName("pending").setDescription("Applications waiting for a decision")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const sub = interaction.options.getSubcommand();
    const color = (await client.guildConfig.get(guild.id)).settings.embedColor;

    if (sub === "create") {
      const name = interaction.options.getString("name", true).trim().toLowerCase();
      if (!/^[a-z0-9 _-]{2,32}$/.test(name)) {
        await interaction.reply({ content: "Form names use letters, numbers, spaces, - and _ (2–32 characters).", ephemeral: true });
        return;
      }
      const questions: string[] = [];
      for (let i = 1; i <= MAX_QUESTIONS; i++) {
        const q = interaction.options.getString(`question${i}`)?.trim();
        if (q) questions.push(q.slice(0, MAX_QUESTION_LENGTH));
      }
      const reviewChannel = interaction.options.getChannel("review_channel", true);
      const role = interaction.options.getRole("role");
      if (role) {
        const problem = await roleIdGrantProblem(guild, role.id);
        if (problem) {
          await interaction.reply({ content: `That role can't be the reward: ${problem}.`, ephemeral: true });
          return;
        }
      }
      const [existing] = await client.db.select({ n: count() }).from(applicationForms).where(eq(applicationForms.guildId, guild.id));
      if ((existing?.n ?? 0) >= MAX_FORMS) {
        await interaction.reply({ content: `Up to ${MAX_FORMS} forms per server; delete one first.`, ephemeral: true });
        return;
      }
      const real = guild.channels.cache.get(reviewChannel.id);
      const me = guild.members.me;
      if (!real || !me || real.isThread() || !real.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        await interaction.reply({ content: `I can't post in <#${reviewChannel.id}>.`, ephemeral: true });
        return;
      }
      const [form] = await client.db
        .insert(applicationForms)
        .values({ guildId: guild.id, name, questions, reviewChannelId: reviewChannel.id, roleId: role?.id ?? null, createdBy: interaction.user.id })
        .onConflictDoNothing()
        .returning();
      if (!form) {
        await interaction.reply({ content: `A form called **${name}** already exists.`, ephemeral: true });
        return;
      }
      const embed = knoxEmbed(color)
        .setTitle(`Form created: ${form.name}`)
        .setDescription(`${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nAnswers go to <#${reviewChannel.id}>${role ? `; accepted applicants get <@&${role.id}>` : ""}.\nMembers apply with \`/apply name:${form.name}\`, or post a button with \`/applyform panel name:${form.name}\`.`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === "list") {
      const forms = await client.db.select().from(applicationForms).where(eq(applicationForms.guildId, guild.id)).orderBy(asc(applicationForms.id));
      if (!forms.length) {
        await interaction.reply({ content: "No forms yet. Try /applyform create.", ephemeral: true });
        return;
      }
      const lines = forms.map((f) => `**${f.name}** · ${f.open ? "open" : "closed"} · ${f.questions.length} question${f.questions.length === 1 ? "" : "s"} → <#${f.reviewChannelId}>${f.roleId ? ` · grants <@&${f.roleId}>` : ""}`);
      await interaction.reply({ embeds: [knoxEmbed(color).setTitle(`Application forms (${forms.length}/${MAX_FORMS})`).setDescription(lines.join("\n"))], ephemeral: true });
      return;
    }

    if (sub === "pending") {
      const rows = await client.db
        .select({ id: applications.id, userId: applications.userId, createdAt: applications.createdAt, form: applicationForms.name, channelId: applicationForms.reviewChannelId, messageId: applications.reviewMessageId })
        .from(applications)
        .innerJoin(applicationForms, eq(applications.formId, applicationForms.id))
        .where(and(eq(applications.guildId, guild.id), eq(applications.status, "pending")))
        .orderBy(desc(applications.createdAt))
        .limit(25);
      if (!rows.length) {
        await interaction.reply({ content: "Nothing waiting for a decision.", ephemeral: true });
        return;
      }
      const lines = rows.map((r) => {
        const link = r.messageId ? `https://discord.com/channels/${guild.id}/${r.channelId}/${r.messageId}` : null;
        return `**#${r.id}** ${r.form} · <@${r.userId}> · <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>${link ? ` · [review](${link})` : ""}`;
      });
      await interaction.reply({ embeds: [knoxEmbed(color).setTitle(`Pending applications (${rows.length})`).setDescription(lines.join("\n").slice(0, 4000))], ephemeral: true });
      return;
    }

    const form = await findForm(client, guild.id, interaction.options.getString("name", true));
    if (!form) {
      await interaction.reply({ content: "No form with that name. See /applyform list.", ephemeral: true });
      return;
    }
    if (sub === "open" || sub === "close") {
      await client.db.update(applicationForms).set({ open: sub === "open" }).where(eq(applicationForms.id, form.id));
      await interaction.reply({ content: `**${form.name}** is now ${sub === "open" ? "taking applications" : "closed to new applications"}.`, ephemeral: true });
      return;
    }
    if (sub === "delete") {
      await client.db.delete(applicationForms).where(eq(applicationForms.id, form.id));
      await interaction.reply({ content: `Deleted **${form.name}** and its applications.`, ephemeral: true });
      return;
    }
    // panel
    const target = interaction.options.getChannel("channel")?.id ?? interaction.channelId;
    const channel = guild.channels.cache.get(target);
    const me = guild.members.me;
    if (!channel || !me || !channel.isTextBased() || channel.isThread() || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply({ content: "I can't post in that channel.", ephemeral: true });
      return;
    }
    await channel.send({
      embeds: [knoxEmbed(color).setTitle(`Apply: ${form.name}`).setDescription(`Press the button and answer ${form.questions.length} short question${form.questions.length === 1 ? "" : "s"}. Staff review every application and reply by DM.`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(appId.start(form.id)).setLabel("Apply").setStyle(ButtonStyle.Primary).setEmoji("📝"))],
    });
    await interaction.reply({ content: `Apply button for **${form.name}** posted in <#${channel.id}>.`, ephemeral: true });
  },
};

export const applyCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Fill in an application form")
    .addStringOption((o) => o.setName("name").setDescription("Which form (leave empty if there is only one)").setMaxLength(32)),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const name = interaction.options.getString("name")?.trim().toLowerCase();
    const forms = await client.db.select().from(applicationForms).where(and(eq(applicationForms.guildId, guild.id), eq(applicationForms.open, true))).orderBy(asc(applicationForms.id));
    if (!forms.length) {
      await interaction.reply({ content: "This server isn't taking applications right now.", ephemeral: true });
      return;
    }
    const form = name ? forms.find((f) => f.name === name) : forms.length === 1 ? forms[0] : null;
    if (!form) {
      await interaction.reply({
        content: name ? `No open form called **${name}**. Open forms: ${forms.map((f) => `\`${f.name}\``).join(", ")}.` : `Which form? ${forms.map((f) => `\`/apply name:${f.name}\``).join(" · ")}`,
        ephemeral: true,
      });
      return;
    }
    await openApplication(interaction, client, form);
  },
};
