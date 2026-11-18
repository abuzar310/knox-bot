// The quarantine appeal flow on Discord: the button in #appeal, the member's form, and the staff decision in the
// review channel. The rules live in appeal-kit.ts (tested without Discord); this is the Discord wiring around them.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import type { GuildSettings } from "@knox/config";
import { modCases, quarantineAppeals, quarantineConfig, quarantines } from "@knox/db";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { resolveKnoxRank } from "../../../permissions/resolve.js";
import { isQuarantined } from "../../../lib/role-guard.js";
import { getQuarantineConfig, releaseMember } from "./quarantine.js";
import { logLine } from "./modlog.js";
import {
  APPEAL_COOLDOWN_MS,
  NOTE_MAX,
  appealFormText,
  appealPublicOutcome,
  appealRefusal,
  bothAnswered,
  canAppeal,
  cleanAnswer,
  memberOutcomeText,
  reviewText,
  runDecision,
  type Decision,
} from "./appeal-kit.js";

const PREFIX = "knox:qappeal:";
export const APPEAL_OPEN_ID = `${PREFIX}open`;
const FORM_ID = `${PREFIX}form`;
const acceptButton = (appealId: number) => `${PREFIX}accept:${appealId}`;
const rejectButton = (appealId: number) => `${PREFIX}reject:${appealId}`;
const decideModal = (decision: Decision, appealId: number) => `${PREFIX}decide:${decision}:${appealId}`;

export function isAppealButton(id: string): boolean {
  return id === APPEAL_OPEN_ID || id.startsWith(`${PREFIX}accept:`) || id.startsWith(`${PREFIX}reject:`);
}
export function isAppealModal(id: string): boolean {
  return id === FORM_ID || id.startsWith(`${PREFIX}decide:`);
}

function staff(member: GuildMember, permissionRows: Parameters<typeof resolveKnoxRank>[1]): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    hasMinRank(resolveKnoxRank(member, permissionRows), "mod")
  );
}

async function textChannelById(guild: Guild, id: string | null | undefined): Promise<TextChannel | null> {
  if (!id) return null;
  const channel = guild.channels.cache.get(id) ?? (await guild.channels.fetch(id).catch(() => null));
  return channel?.type === ChannelType.GuildText ? channel : null;
}

/** who put the member in quarantine, for the review post: "ZARU" when the bot did it, else a mention */
async function quarantinedBy(client: KnoxClient, guildId: string, caseNumber: number | null): Promise<string | null> {
  if (!caseNumber) return null;
  const [row] = await client.db
    .select({ moderatorId: modCases.moderatorId })
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber), eq(modCases.type, "quarantine")))
    .limit(1);
  if (!row) return null;
  return row.moderatorId === client.user?.id ? "ZARU" : `<@${row.moderatorId}>`;
}

/**
 * Posts (and pins) the appeal form in #appeal, or leaves the one already there. Called from setup and whenever
 * someone is quarantined; re-posts only when the stored message is gone (10008), never on a passing fetch error,
 * so a restart can't pin duplicates. Its own try/catch: a failure here never blocks a quarantine.
 */
export async function postAppealForm(client: KnoxClient, guild: Guild, config: { appealChannelId: string | null; appealFormMessageId?: string | null }, settings: GuildSettings | null): Promise<void> {
  try {
    const channelId = config.appealChannelId;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (channel?.type !== ChannelType.GuildText) return;

    if (config.appealFormMessageId) {
      const existing = await channel.messages.fetch(config.appealFormMessageId).then((m) => m, (err: { code?: number }) => (err?.code === 10008 ? null : "error" as const));
      if (existing === "error") return; // a passing fetch error: leave the stored one, don't risk a duplicate
      if (existing) return; // still there
    }

    const embed = knoxEmbed(settings?.embedColor).setTitle("Quarantined?").setDescription(appealFormText());
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(APPEAL_OPEN_ID).setLabel("Appeal my quarantine").setStyle(ButtonStyle.Primary).setEmoji("📝"),
    );
    const message = await channel.send({ embeds: [embed], components: [row] });
    await message.pin().catch(() => undefined);
    await client.db.update(quarantineConfig).set({ appealFormMessageId: message.id }).where(eq(quarantineConfig.guildId, guild.id));
  } catch (error) {
    logger.debug({ err: error, guildId: guild.id }, "could not post the appeal form");
  }
}

/** the member pressed "Appeal my quarantine": showModal must be the first reply, so only the in-memory check runs here */
export async function openAppealForm(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) return;
  if (!isQuarantined(interaction.guildId, interaction.user.id)) {
    await interaction.reply({ content: "You're not quarantined, so there's nothing to appeal.", ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(FORM_ID)
    .setTitle("Appeal your quarantine")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("what_happened").setLabel("What happened?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("why_lift").setLabel("Why should it be lifted?").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}

/** the member sent the form: now the database checks run, behind a deferred ephemeral reply */
export async function submitAppeal(interaction: ModalSubmitInteraction, client: KnoxClient): Promise<void> {
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const userId = interaction.user.id;

  const config = await getQuarantineConfig(client, guild.id);
  const review = await textChannelById(guild, config?.reviewChannelId);
  if (!config || !review) {
    await interaction.editReply("Appeals aren't set up in this server yet. Tell a moderator.");
    return;
  }

  const [record] = await client.db.select().from(quarantines).where(and(eq(quarantines.guildId, guild.id), eq(quarantines.userId, userId))).limit(1);
  if (!record) {
    await interaction.editReply(appealRefusal({ ok: false, why: "not-quarantined" }));
    return;
  }

  const [open] = await client.db
    .select({ id: quarantineAppeals.id })
    .from(quarantineAppeals)
    .where(and(eq(quarantineAppeals.guildId, guild.id), eq(quarantineAppeals.userId, userId), eq(quarantineAppeals.status, "open")))
    .limit(1);
  const [lastReject] = await client.db
    .select({ decidedAt: quarantineAppeals.decidedAt })
    .from(quarantineAppeals)
    .where(and(eq(quarantineAppeals.guildId, guild.id), eq(quarantineAppeals.userId, userId), eq(quarantineAppeals.quarantineId, record.id), eq(quarantineAppeals.status, "rejected")))
    .orderBy(desc(quarantineAppeals.decidedAt))
    .limit(1);

  const check = canAppeal({ quarantined: true, hasOpenAppeal: Boolean(open), lastRejectedAt: lastReject?.decidedAt?.getTime() ?? null }, Date.now());
  if (!check.ok) {
    await interaction.editReply(appealRefusal(check));
    return;
  }

  const whatHappened = cleanAnswer(interaction.fields.getTextInputValue("what_happened"));
  const whyLift = cleanAnswer(interaction.fields.getTextInputValue("why_lift"));
  if (!bothAnswered(whatHappened, whyLift)) {
    await interaction.editReply("Please fill in both boxes.");
    return;
  }

  let appealId: number;
  try {
    const [inserted] = await client.db
      .insert(quarantineAppeals)
      .values({ guildId: guild.id, userId, quarantineId: record.id, caseNumber: record.caseNumber ?? null, whatHappened, whyLift })
      .returning({ id: quarantineAppeals.id });
    appealId = inserted!.id;
  } catch (error) {
    // 23505 = the one-open-appeal index: a second form landed first
    if ((error as { code?: string }).code === "23505") {
      await interaction.editReply(appealRefusal({ ok: false, why: "open" }));
      return;
    }
    throw error;
  }

  const embed = knoxEmbed(undefined)
    .setColor(0xffb347)
    .setTitle("Quarantine appeal")
    .setDescription(reviewText({ userId, tag: interaction.user.tag, caseNumber: record.caseNumber, quarantinedBy: await quarantinedBy(client, guild.id, record.caseNumber), whatHappened, whyLift }));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(acceptButton(appealId)).setLabel("Accept (lift it)").setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(rejectButton(appealId)).setLabel("Reject").setStyle(ButtonStyle.Danger).setEmoji("✖️"),
  );
  const posted = await review.send({ embeds: [embed], components: [buttons] }).then((m) => m, () => null);
  if (!posted) {
    // couldn't reach the staff: drop the row so the member isn't blocked by an appeal nobody can see
    await client.db.delete(quarantineAppeals).where(eq(quarantineAppeals.id, appealId));
    await interaction.editReply("I couldn't reach the staff channel. Please try again in a little while.");
    return;
  }
  await client.db.update(quarantineAppeals).set({ reviewMessageId: posted.id }).where(eq(quarantineAppeals.id, appealId));
  await interaction.editReply("Your appeal has been sent to the moderators. You'll hear back by DM.");
}

/** a staff member pressed Accept or Reject: check them, then open the note form (showModal must be the first reply) */
export async function startDecision(interaction: ButtonInteraction, client: KnoxClient, decision: Decision, appealId: number): Promise<void> {
  if (!interaction.guild) return;
  const cached = await client.guildConfig.get(interaction.guild.id);
  const member = interaction.member && "permissions" in interaction.member ? (interaction.member as GuildMember) : await interaction.guild.members.fetch(interaction.user.id);
  if (!staff(member, cached.permissionRows)) {
    await interaction.reply({ content: "Only staff can decide appeals.", ephemeral: true });
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(decideModal(decision, appealId))
    .setTitle(decision === "accept" ? "Accept the appeal" : "Reject the appeal")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("note")
          .setLabel(decision === "accept" ? "A word to the member (sent to them)" : "Why not? (sent to the member)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(NOTE_MAX)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}

/** the staff note came back: decide the appeal and tell the member */
export async function finishDecision(interaction: ModalSubmitInteraction, client: KnoxClient): Promise<void> {
  if (!interaction.guild) return;
  const parts = interaction.customId.slice(`${PREFIX}decide:`.length).split(":");
  const decision = parts[0] as Decision;
  const appealId = Number(parts[1]);
  if ((decision !== "accept" && decision !== "reject") || !Number.isFinite(appealId)) return;

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const cached = await client.guildConfig.get(guild.id);
  const member = interaction.member && "permissions" in interaction.member ? (interaction.member as GuildMember) : await guild.members.fetch(interaction.user.id);
  if (!staff(member, cached.permissionRows)) {
    await interaction.editReply("Only staff can decide appeals.");
    return;
  }

  const [appeal] = await client.db.select().from(quarantineAppeals).where(eq(quarantineAppeals.id, appealId)).limit(1);
  if (!appeal) {
    await interaction.editReply("That appeal is gone.");
    return;
  }
  const note = cleanAnswer(interaction.fields.getTextInputValue("note")).slice(0, NOTE_MAX);
  const userId = appeal.userId;

  const result = await runDecision(
    {
      liveQuarantineId: async () => {
        const [row] = await client.db.select({ id: quarantines.id }).from(quarantines).where(and(eq(quarantines.guildId, guild.id), eq(quarantines.userId, userId))).limit(1);
        return row?.id ?? null;
      },
      claim: async () => {
        const [row] = await client.db
          .update(quarantineAppeals)
          .set({ status: decision === "accept" ? "accepted" : "rejected", decidedAt: new Date(), decidedBy: interaction.user.id, decidedNote: note })
          .where(and(eq(quarantineAppeals.id, appealId), eq(quarantineAppeals.status, "open")))
          .returning({ id: quarantineAppeals.id });
        return row ?? null;
      },
      release: async () => {
        const out = await releaseMember(client, guild, userId, { moderator: interaction.user, reason: `Appeal accepted: ${note}`.slice(0, 500), settings: cached.settings, byHand: false });
        if (!out.ok) throw new Error("they weren't quarantined any more");
      },
      reopen: async () => {
        await client.db.update(quarantineAppeals).set({ status: "open", decidedAt: null, decidedBy: null, decidedNote: null }).where(eq(quarantineAppeals.id, appealId));
      },
    },
    { decision, appealQuarantineId: appeal.quarantineId },
  );

  if (result.kind === "stale") {
    await interaction.editReply("That quarantine has already ended — there's nothing to decide.");
    return;
  }
  if (result.kind === "already-handled") {
    await interaction.editReply("Another moderator already handled this appeal.");
    return;
  }
  if (result.kind === "release-failed") {
    await interaction.editReply(`I couldn't give their roles back, so I reopened the appeal — please try again. (${result.error instanceof Error ? result.error.message : "unknown error"})`);
    return;
  }

  const retryAt = Date.now() + APPEAL_COOLDOWN_MS;
  const user = await client.users.fetch(userId).catch(() => null);
  const dmed = user ? await user.send(memberOutcomeText(decision, note, retryAt)).then(() => true, () => false) : false;
  // reject + DM failed + still quarantined: a short line in #appeal, with only the outcome (never their words or the note)
  if (!dmed && decision === "reject" && isQuarantined(guild.id, userId)) {
    const config = await getQuarantineConfig(client, guild.id);
    const appealCh = await textChannelById(guild, config?.appealChannelId);
    await appealCh?.send({ content: appealPublicOutcome(userId, decision, retryAt), allowedMentions: { users: [userId] } }).catch(() => undefined);
  }

  await markReviewDecided(client, guild, appeal.reviewMessageId, decision, interaction.user.id).catch(() => undefined);
  await logLine(
    guild,
    cached.settings,
    decision === "accept" ? "Quarantine appeal accepted" : "Quarantine appeal rejected",
    `${user?.tag ?? userId} (<@${userId}>) · by ${interaction.user.tag} · told: ${dmed ? "DM" : decision === "reject" ? "#appeal" : "not reachable"}`,
    decision === "accept" ? 0x57f287 : 0xed4245,
  );
  await interaction.editReply(decision === "accept" ? "Accepted — they've been released and told." : "Rejected — they've been told.");
}

/** disables the buttons on the review post and marks who decided */
async function markReviewDecided(client: KnoxClient, guild: Guild, reviewMessageId: string | null, decision: Decision, deciderId: string): Promise<void> {
  if (!reviewMessageId) return;
  const config = await getQuarantineConfig(client, guild.id);
  const channel = await textChannelById(guild, config?.reviewChannelId);
  const message = channel ? await channel.messages.fetch(reviewMessageId).catch(() => null) : null;
  if (!message) return;
  const embed = EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder()).addFields({
    name: decision === "accept" ? "✅ Accepted" : "✖️ Rejected",
    value: `by <@${deciderId}> <t:${Math.floor(Date.now() / 1000)}:R>`,
  });
  const disabled = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("knox:qappeal:done").setLabel(decision === "accept" ? "Accepted" : "Rejected").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );
  await message.edit({ embeds: [embed], components: [disabled] }).catch(() => undefined);
}
