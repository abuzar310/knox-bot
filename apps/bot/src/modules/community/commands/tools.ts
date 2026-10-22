import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { customTags, memberProfiles, reactionPanels, reminders, suggestions } from "@knox/db";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../../../client.js";
import type { KnoxCommand } from "../../../types.js";
import { resolveKnoxRank } from "../../../permissions/resolve.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";
import { markAfk } from "../../../lib/afk-cache.js";
import { parseDuration } from "../../moderation/lib/duration.js";
import { getProfile } from "../../../lib/profiles.js";

export const VERIFY_ID = "knox:verify";

/** a tag may be changed by whoever made it, or by staff (Manage Messages, or ZARU mod rank) */
async function mayEditTag(interaction: Parameters<KnoxCommand["execute"]>[0], client: KnoxClient, ownerId: string) {
  if (!interaction.guild) return false;
  if (ownerId === interaction.user.id) return true;
  const member = interaction.guild.members.cache.get(interaction.user.id) ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  const cached = await client.guildConfig.get(interaction.guild.id);
  return hasMinRank(resolveKnoxRank(member, cached.permissionRows), "mod");
}

export const tagCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Saved replies")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Create a tag")
        .addStringOption((o) => o.setName("name").setRequired(true).setDescription("Name"))
        .addStringOption((o) => o.setName("content").setRequired(true).setDescription("Text")),
    )
    .addSubcommand((s) =>
      s.setName("get").setDescription("Post a tag").addStringOption((o) =>
        o.setName("name").setRequired(true).setDescription("Name"),
      ),
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Delete a tag").addStringOption((o) =>
        o.setName("name").setRequired(true).setDescription("Name"),
      ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List tags")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    if (sub === "add") {
      const name = interaction.options.getString("name", true).toLowerCase().slice(0, 32);
      const content = interaction.options.getString("content", true).slice(0, 1800);
      const [taken] = await ctx.client.db
        .select({ authorId: customTags.authorId })
        .from(customTags)
        .where(and(eq(customTags.guildId, guildId), eq(customTags.name, name)))
        .limit(1);
      if (taken && !(await mayEditTag(interaction, ctx.client, taken.authorId))) {
        await interaction.reply({ content: `\`${name}\` belongs to <@${taken.authorId}>. Only they or staff can change it.`, ephemeral: true });
        return;
      }
      await ctx.client.db
        .insert(customTags)
        .values({ guildId, name, content, authorId: interaction.user.id })
        .onConflictDoUpdate({
          target: [customTags.guildId, customTags.name],
          set: { content, authorId: interaction.user.id },
        });
      await interaction.reply({ content: `Tag \`${name}\` saved.`, ephemeral: true });
      return;
    }
    if (sub === "list") {
      const rows = await ctx.client.db.select().from(customTags).where(eq(customTags.guildId, guildId));
      await interaction.reply({
        content: rows.length ? rows.map((r) => `\`${r.name}\``).join(", ") : "No tags yet.",
        ephemeral: true,
      });
      return;
    }
    const name = interaction.options.getString("name", true).toLowerCase();
    const [row] = await ctx.client.db
      .select()
      .from(customTags)
      .where(and(eq(customTags.guildId, guildId), eq(customTags.name, name)))
      .limit(1);
    if (!row) {
      await interaction.reply({ content: "Unknown tag.", ephemeral: true });
      return;
    }
    if (sub === "remove") {
      if (!(await mayEditTag(interaction, ctx.client, row.authorId))) {
        await interaction.reply({ content: `\`${name}\` belongs to <@${row.authorId}>. Only they or staff can delete it.`, ephemeral: true });
        return;
      }
      await ctx.client.db
        .delete(customTags)
        .where(and(eq(customTags.guildId, guildId), eq(customTags.name, name)));
      await interaction.reply({ content: `Deleted \`${name}\`.`, ephemeral: true });
      return;
    }
    await interaction.reply({ content: row.content });
  },
};

export const afkCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set AFK")
    .addStringOption((o) => o.setName("reason").setDescription("Why").setRequired(false)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const reason = (interaction.options.getString("reason") ?? "AFK").slice(0, 200);
    await getProfile(ctx.client.db, interaction.guild.id, interaction.user.id);
    await ctx.client.db
      .update(memberProfiles)
      .set({ afkReason: reason })
      .where(
        and(eq(memberProfiles.guildId, interaction.guild.id), eq(memberProfiles.userId, interaction.user.id)),
      );
    await markAfk(ctx.client, interaction.guild.id, interaction.user.id, true);
    await interaction.reply({ content: `AFK set: ${reason}` });
  },
};

export const snipeCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder().setName("snipe").setDescription("Last deleted message in this channel"),
  async execute(interaction, ctx) {
    const hit = ctx.client.snipe.get(interaction.channelId);
    if (!hit) {
      await interaction.reply({ content: "Nothing to snipe.", ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Snipe")
          .setDescription(hit.content.slice(0, 1800) || "*empty*")
          .setFooter({ text: hit.author }),
      ],
    });
  },
};

export const pollCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll (Discord's own, with live results)")
    .addStringOption((o) => o.setName("question").setRequired(true).setDescription("Question").setMaxLength(300))
    .addStringOption((o) => o.setName("a").setRequired(true).setDescription("Answer A").setMaxLength(55))
    .addStringOption((o) => o.setName("b").setRequired(true).setDescription("Answer B").setMaxLength(55))
    .addStringOption((o) => o.setName("c").setRequired(false).setDescription("Answer C").setMaxLength(55))
    .addStringOption((o) => o.setName("d").setRequired(false).setDescription("Answer D").setMaxLength(55))
    .addStringOption((o) => o.setName("e").setRequired(false).setDescription("Answer E").setMaxLength(55))
    .addIntegerOption((o) => o.setName("hours").setDescription("How long it runs (1-168, default 24)").setMinValue(1).setMaxValue(168))
    .addBooleanOption((o) => o.setName("multi").setDescription("Allow picking more than one answer")),
  async execute(interaction) {
    const question = interaction.options.getString("question", true).slice(0, 300);
    const answers = ["a", "b", "c", "d", "e"]
      .map((k) => interaction.options.getString(k))
      .filter((v): v is string => Boolean(v))
      .map((text) => ({ text: text.slice(0, 55) }));
    // a native poll: Discord counts the votes, shows results live and closes it on time
    await interaction.reply({
      poll: {
        question: { text: question },
        answers,
        duration: interaction.options.getInteger("hours") ?? 24,
        allowMultiselect: interaction.options.getBoolean("multi") ?? false,
      },
    });
  },
};

export const reminderCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("reminder")
    .setDescription("Remind you later")
    .addStringOption((o) => o.setName("when").setRequired(true).setDescription("e.g. 10m, 2h"))
    .addStringOption((o) => o.setName("text").setRequired(true).setDescription("What")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const ms = parseDuration(interaction.options.getString("when", true));
    if (!ms) {
      await interaction.reply({ content: "Use `10m`, `2h`, or `1d`.", ephemeral: true });
      return;
    }
    const text = interaction.options.getString("text", true).slice(0, 500);
    const fireAt = new Date(Date.now() + ms);
    await ctx.client.db.insert(reminders).values({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      text,
      fireAt,
    });
    await interaction.reply({ content: `I'll remind you <t:${Math.floor(fireAt.getTime() / 1000)}:R>.` });
  },
};

export const suggestCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Post a suggestion")
    .addStringOption((o) => o.setName("idea").setRequired(true).setDescription("Your idea")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const idea = interaction.options.getString("idea", true).slice(0, 1000);
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Suggestion")
          .setDescription(idea)
          .setFooter({ text: interaction.user.username }),
      ],
    });
    const msg = await interaction.fetchReply();
    await msg.react("👍").catch(() => undefined);
    await msg.react("👎").catch(() => undefined);
    const [row] = await ctx.client.db
      .insert(suggestions)
      .values({
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        content: idea,
        messageId: msg.id,
        channelId: interaction.channelId,
      })
      .returning({ id: suggestions.id });
    // the number lets staff answer it with /suggestion approve|deny
    if (row) {
      await msg
        .edit({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle(`Suggestion #${row.id}`).setDescription(idea).setFooter({ text: `${interaction.user.username} · open` })] })
        .catch(() => undefined);
    }
  },
};

export const verifyCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verification panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption((o) => o.setName("role").setRequired(true).setDescription("Role to give")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const role = interaction.options.getRole("role", true);
    const problem = await roleIdGrantProblem(interaction.guild, role.id);
    if (problem) {
      await interaction.reply({ content: `Can't use that as the verification role: ${problem}.`, ephemeral: true });
      return;
    }
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, verifyRoleId: role.id },
    });
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings.embedColor)
          .setTitle("Verification")
          .setDescription("Click to get access."),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(VERIFY_ID).setLabel("Verify").setStyle(ButtonStyle.Success),
        ),
      ],
    });
  },
};

export const reactionRoleCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Self-assign roles with buttons")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s.setName("panel").setDescription("Post a new panel").addStringOption((o) =>
        o.setName("title").setRequired(true).setDescription("Panel title"),
      ),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a role button to the latest panel")
        .addRoleOption((o) => o.setName("role").setRequired(true).setDescription("Role"))
        .addStringOption((o) => o.setName("label").setRequired(true).setDescription("Button label")),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Take a role button off the latest panel")
        .addRoleOption((o) => o.setName("role").setRequired(true).setDescription("Role")),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "panel") {
      const title = interaction.options.getString("title", true);
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle(title)
            .setDescription("Click a button to get or remove a role."),
        ],
      });
      const msg = await interaction.fetchReply();
      await ctx.client.db.insert(reactionPanels).values({
        guildId: interaction.guild.id,
        messageId: msg.id,
        channelId: interaction.channelId,
        mapping: [],
      });
      return;
    }
    const removing = sub === "remove";
    const role = interaction.options.getRole("role", true);
    const label = (interaction.options.getString("label") ?? role.name).slice(0, 80);
    if (!removing) {
      const problem = await roleIdGrantProblem(interaction.guild, role.id);
      if (problem) {
        await interaction.reply({ content: `Can't put that role on a panel: ${problem}.`, ephemeral: true });
        return;
      }
    }
    const [latest] = await ctx.client.db
      .select()
      .from(reactionPanels)
      .where(eq(reactionPanels.guildId, interaction.guild.id))
      .orderBy(desc(reactionPanels.id))
      .limit(1);
    if (!latest) {
      await interaction.reply({ content: "Post a panel first with `/reactionrole panel`.", ephemeral: true });
      return;
    }
    if (removing && !latest.mapping.some((m) => m.roleId === role.id)) {
      await interaction.reply({ content: `${role} isn't on the latest panel.`, ephemeral: true });
      return;
    }
    if (!removing && latest.mapping.length >= 25) {
      await interaction.reply({ content: "A panel holds at most 25 buttons. Post a new panel with `/reactionrole panel`.", ephemeral: true });
      return;
    }
    const mapping = removing
      ? latest.mapping.filter((m) => m.roleId !== role.id)
      : [...latest.mapping.filter((m) => m.roleId !== role.id), { roleId: role.id, label }];
    await ctx.client.db.update(reactionPanels).set({ mapping }).where(eq(reactionPanels.id, latest.id));
    const channel = await interaction.guild.channels.fetch(latest.channelId);
    if (channel?.isTextBased() && !channel.isDMBased()) {
      const msg = await channel.messages.fetch(latest.messageId).catch(() => null);
      if (msg) {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let i = 0; i < mapping.length; i += 5) {
          const row = new ActionRowBuilder<ButtonBuilder>();
          for (const item of mapping.slice(i, i + 5)) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`knox:rr:${latest.id}:${item.roleId}`)
                .setLabel(item.label)
                .setStyle(ButtonStyle.Secondary),
            );
          }
          rows.push(row);
        }
        await msg.edit({ components: rows.slice(0, 5) });
      }
    }
    await interaction.reply({ content: removing ? `Removed ${role} from the panel.` : `Added ${role} to the panel.`, ephemeral: true });
  },
};
