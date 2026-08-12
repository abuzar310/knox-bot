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
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { parseDuration } from "../../moderation/lib/duration.js";
import { getProfile } from "../../../lib/profiles.js";

export const VERIFY_ID = "knox:verify";

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
    const reason = interaction.options.getString("reason") ?? "AFK";
    await getProfile(ctx.client.db, interaction.guild.id, interaction.user.id);
    await ctx.client.db
      .update(memberProfiles)
      .set({ afkReason: reason })
      .where(
        and(eq(memberProfiles.guildId, interaction.guild.id), eq(memberProfiles.userId, interaction.user.id)),
      );
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
    .setDescription("Create a poll")
    .addStringOption((o) => o.setName("question").setRequired(true).setDescription("Question"))
    .addStringOption((o) => o.setName("a").setRequired(true).setDescription("Option A"))
    .addStringOption((o) => o.setName("b").setRequired(true).setDescription("Option B"))
    .addStringOption((o) => o.setName("c").setRequired(false).setDescription("Option C"))
    .addStringOption((o) => o.setName("d").setRequired(false).setDescription("Option D")),
  async execute(interaction, ctx) {
    const question = interaction.options.getString("question", true);
    const options = ["a", "b", "c", "d"]
      .map((k) => interaction.options.getString(k))
      .filter((v): v is string => Boolean(v));
    const emojis = ["🇦", "🇧", "🇨", "🇩"];
    const body = options.map((opt, i) => `${emojis[i]} ${opt}`).join("\n");
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Poll")
          .setDescription(`**${question}**\n\n${body}`),
      ],
    });
    const pollMsg = await interaction.fetchReply();
    for (let i = 0; i < options.length; i++) {
      await pollMsg.react(emojis[i]!).catch(() => undefined);
    }
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
    await ctx.client.db.insert(suggestions).values({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      content: idea,
      messageId: msg.id,
    });
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
    const role = interaction.options.getRole("role", true);
    const label = interaction.options.getString("label", true).slice(0, 80);
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
    const mapping = [...latest.mapping, { roleId: role.id, label }];
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
    await interaction.reply({ content: `Added ${role} to the panel.`, ephemeral: true });
  },
};
