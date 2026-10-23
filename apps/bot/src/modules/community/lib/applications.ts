// Application forms: a modal of up to five questions, a review post with Accept / Deny, a role on acceptance.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type User,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { applicationForms, applications } from "@knox/db";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { resolveKnoxRank } from "../../../permissions/resolve.js";
import { canGrantRole } from "../../../lib/roles.js";

export const APP_PREFIX = "knox:app:";
export const MAX_QUESTIONS = 5;
/** Discord caps a modal label at 45 characters */
export const MAX_QUESTION_LENGTH = 45;

export type ApplicationForm = typeof applicationForms.$inferSelect;
export type Application = typeof applications.$inferSelect;

export const appId = {
  start: (formId: number) => `${APP_PREFIX}start:${formId}`,
  modal: (formId: number) => `${APP_PREFIX}modal:${formId}`,
  accept: (applicationId: number) => `${APP_PREFIX}accept:${applicationId}`,
  deny: (applicationId: number) => `${APP_PREFIX}deny:${applicationId}`,
  denyModal: (applicationId: number) => `${APP_PREFIX}denymodal:${applicationId}`,
};

/** "knox:app:<action>:<number>" → its parts, or null for anything else */
export function parseAppId(customId: string): { action: string; id: number } | null {
  if (!customId.startsWith(APP_PREFIX)) return null;
  const [action, raw] = customId.slice(APP_PREFIX.length).split(":");
  const id = Number(raw);
  if (!action || !Number.isInteger(id) || id < 1) return null;
  return { action, id };
}

export function buildApplyModal(form: ApplicationForm) {
  const modal = new ModalBuilder().setCustomId(appId.modal(form.id)).setTitle(`Apply: ${form.name}`.slice(0, 45));
  form.questions.slice(0, MAX_QUESTIONS).forEach((question, i) => {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`q${i}`)
          .setLabel(question.slice(0, MAX_QUESTION_LENGTH))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
  });
  return modal;
}

/** staff = Manage Server on Discord, or the server's mod rank (or higher) */
export async function isStaff(interaction: ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction, client: KnoxClient) {
  const guild = interaction.guild;
  if (!guild) return false;
  const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const cached = await client.guildConfig.get(guild.id);
  return hasMinRank(resolveKnoxRank(member, cached.permissionRows), "mod");
}

export async function findForm(client: KnoxClient, guildId: string, name: string) {
  const [form] = await client.db
    .select()
    .from(applicationForms)
    .where(and(eq(applicationForms.guildId, guildId), eq(applicationForms.name, name.trim().toLowerCase())))
    .limit(1);
  return form ?? null;
}

async function pendingFor(client: KnoxClient, formId: number, userId: string) {
  const [row] = await client.db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.formId, formId), eq(applications.userId, userId), eq(applications.status, "pending")))
    .limit(1);
  return row ?? null;
}

/** shows the form's modal, unless the form is closed or the person already has an answer waiting */
export async function openApplication(interaction: ButtonInteraction | ChatInputCommandInteraction, client: KnoxClient, form: ApplicationForm) {
  if (!form.open) {
    await interaction.reply({ content: `**${form.name}** isn't taking applications right now.`, ephemeral: true });
    return;
  }
  if (await pendingFor(client, form.id, interaction.user.id)) {
    await interaction.reply({ content: `You already have a **${form.name}** application waiting for review.`, ephemeral: true });
    return;
  }
  await interaction.showModal(buildApplyModal(form));
}

function reviewEmbed(form: ApplicationForm, app: Application, user: User, color: string, decision?: { status: string; reviewer: string; reason?: string }) {
  const embed = knoxEmbed(decision ? (decision.status === "accepted" ? "#3ddc84" : "#ff5c5c") : color)
    .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL() })
    .setTitle(`Application #${app.id} · ${form.name}${decision ? ` · ${decision.status}` : ""}`)
    .setTimestamp(app.createdAt);
  form.questions.forEach((question, i) => {
    embed.addFields({ name: question.slice(0, 256), value: (app.answers[i] || "—").slice(0, 1024) });
  });
  if (decision) embed.setFooter({ text: `${decision.status} by ${decision.reviewer}${decision.reason ? ` · ${decision.reason.slice(0, 200)}` : ""}` });
  return embed;
}

function reviewButtons(applicationId: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(appId.accept(applicationId)).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(appId.deny(applicationId)).setLabel("Deny").setStyle(ButtonStyle.Danger),
  );
}

/** a submitted modal becomes an application and a review post with buttons */
export async function submitApplication(interaction: ModalSubmitInteraction, client: KnoxClient, formId: number) {
  const guild = interaction.guild;
  if (!guild) return;
  const [form] = await client.db.select().from(applicationForms).where(and(eq(applicationForms.id, formId), eq(applicationForms.guildId, guild.id))).limit(1);
  if (!form || !form.open) {
    await interaction.reply({ content: "That form is gone or closed.", ephemeral: true });
    return;
  }
  if (await pendingFor(client, form.id, interaction.user.id)) {
    await interaction.reply({ content: `You already have a **${form.name}** application waiting for review.`, ephemeral: true });
    return;
  }
  const answers = form.questions.map((_, i) => {
    try {
      return interaction.fields.getTextInputValue(`q${i}`).trim().slice(0, 1000);
    } catch {
      return "";
    }
  });
  const [app] = await client.db
    .insert(applications)
    .values({ formId: form.id, guildId: guild.id, userId: interaction.user.id, answers })
    .returning();
  if (!app) return;
  const cached = await client.guildConfig.get(guild.id);
  const channel = await guild.channels.fetch(form.reviewChannelId).catch(() => null);
  if (channel && channel.isTextBased() && !channel.isDMBased()) {
    const sent = await channel
      .send({ embeds: [reviewEmbed(form, app, interaction.user, cached.settings.embedColor)], components: [reviewButtons(app.id)] })
      .catch(() => null);
    if (sent) await client.db.update(applications).set({ reviewMessageId: sent.id }).where(eq(applications.id, app.id));
  }
  await interaction.reply({ content: `Your **${form.name}** application is in. Staff will get back to you by DM.`, ephemeral: true });
}

/** Accept or Deny from the review post (deny may carry a reason from its modal) */
export async function decideApplication(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  client: KnoxClient,
  applicationId: number,
  accepted: boolean,
  reason = "",
) {
  const guild = interaction.guild;
  if (!guild) return;
  if (!(await isStaff(interaction, client))) {
    await interaction.reply({ content: "Only staff can decide applications.", ephemeral: true });
    return;
  }
  const [app] = await client.db.select().from(applications).where(and(eq(applications.id, applicationId), eq(applications.guildId, guild.id))).limit(1);
  if (!app) {
    await interaction.reply({ content: "That application no longer exists.", ephemeral: true });
    return;
  }
  if (app.status !== "pending") {
    await interaction.reply({ content: `Application #${app.id} was already ${app.status}.`, ephemeral: true });
    return;
  }
  const [form] = await client.db.select().from(applicationForms).where(eq(applicationForms.id, app.formId)).limit(1);
  if (!form) return;
  const status = accepted ? "accepted" : "denied";
  const claimed = await client.db
    .update(applications)
    .set({ status, reviewerId: interaction.user.id, decidedAt: new Date() })
    .where(and(eq(applications.id, app.id), eq(applications.status, "pending")))
    .returning({ id: applications.id });
  if (!claimed.length) {
    await interaction.reply({ content: "Someone else just decided this one.", ephemeral: true });
    return;
  }

  const notes: string[] = [];
  const user = await client.users.fetch(app.userId).catch(() => null);
  if (accepted && form.roleId) {
    const member = await guild.members.fetch(app.userId).catch(() => null);
    const role = guild.roles.cache.get(form.roleId);
    if (!member) notes.push("They are no longer in the server, so no role was given.");
    else if (!canGrantRole(role)) notes.push("The form's role can't be given out (missing, above ZARU, or has moderator powers).");
    else await member.roles.add(role, `Application #${app.id} accepted by ${interaction.user.tag}`).then(() => notes.push(`Gave <@&${role.id}>.`), () => notes.push("Couldn't add the role (permissions)."));
  }
  if (user) {
    const dm = accepted
      ? `Your **${form.name}** application in **${guild.name}** was accepted. Welcome aboard!${form.roleId ? ` You now have <@&${form.roleId}>.` : ""}`
      : `Your **${form.name}** application in **${guild.name}** was not accepted this time.${reason ? `\nReason: ${reason.slice(0, 500)}` : ""}`;
    await user.send({ content: dm, allowedMentions: { parse: [] } }).then(() => undefined, () => notes.push("Their DMs are closed, so they weren't told."));
  }

  const cached = await client.guildConfig.get(guild.id);
  const embed = reviewEmbed(form, { ...app, status }, user ?? interaction.user, cached.settings.embedColor, { status, reviewer: interaction.user.username, reason });
  const reviewMessage = app.reviewMessageId ? await fetchReviewMessage(guild, form.reviewChannelId, app.reviewMessageId) : null;
  await reviewMessage?.edit({ embeds: [embed], components: [] }).catch(() => undefined);
  await interaction.reply({ content: `Application #${app.id} ${status}.${notes.length ? ` ${notes.join(" ")}` : ""}`, ephemeral: true });
}

async function fetchReviewMessage(guild: Guild, channelId: string, messageId: string) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

/** the Deny button asks for an optional reason first */
export function denyReasonModal(applicationId: number) {
  return new ModalBuilder()
    .setCustomId(appId.denyModal(applicationId))
    .setTitle(`Deny application #${applicationId}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("Reason for the applicant (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500),
      ),
    );
}

/** buttons: Apply on a panel, Accept / Deny on a review post */
export async function handleApplyButton(interaction: ButtonInteraction, client: KnoxClient) {
  const parsed = parseAppId(interaction.customId);
  if (!parsed || !interaction.guild) return;
  if (parsed.action === "start") {
    const [form] = await client.db.select().from(applicationForms).where(and(eq(applicationForms.id, parsed.id), eq(applicationForms.guildId, interaction.guild.id))).limit(1);
    if (!form) {
      await interaction.reply({ content: "That form no longer exists.", ephemeral: true });
      return;
    }
    await openApplication(interaction, client, form);
    return;
  }
  if (parsed.action === "accept") {
    await decideApplication(interaction, client, parsed.id, true);
    return;
  }
  if (parsed.action === "deny") {
    if (!(await isStaff(interaction, client))) {
      await interaction.reply({ content: "Only staff can decide applications.", ephemeral: true });
      return;
    }
    await interaction.showModal(denyReasonModal(parsed.id));
  }
}

/** modals: a filled-in application, or a deny reason */
export async function handleApplyModal(interaction: ModalSubmitInteraction, client: KnoxClient) {
  const parsed = parseAppId(interaction.customId);
  if (!parsed) return;
  if (parsed.action === "modal") {
    await submitApplication(interaction, client, parsed.id);
    return;
  }
  if (parsed.action === "denymodal") {
    let reason = "";
    try {
      reason = interaction.fields.getTextInputValue("reason").trim();
    } catch {
      reason = "";
    }
    await decideApplication(interaction, client, parsed.id, false, reason);
  }
}
