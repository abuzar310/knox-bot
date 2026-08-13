import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { CommunityConfig, GuildSettings } from "@knox/config";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import {
  ensureGuildSettings,
  persistGuildSettings,
} from "../../../config/save-settings.js";
import { snapshotGuildInvites } from "../lib/invites.js";
import {
  resolveBlueprint,
  resultEmbed,
  stashPreview,
  templateApplyRow,
  templatePreviewEmbed,
  installBlueprint,
} from "../lib/server-template-ui.js";

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

function onOff(v: boolean) {
  return v ? "on" : "off";
}

function channelOrDash(id: string | null) {
  return id ? `<#${id}>` : "not set";
}

function communityEmbed(color: string | undefined, c: CommunityConfig, logChannelId: string | null) {
  return knoxEmbed(color)
    .setTitle("Knox setup")
    .setDescription(
      "One command controls welcome, goodbye, invites, autorole, and logs.\nPlaceholders: `{user}` `{username}` `{server}` `{membercount}` `{inviter}` `{invites}`",
    )
    .addFields(
      {
        name: "Welcome",
        value: `${onOff(c.welcomeEnabled)} · ${channelOrDash(c.welcomeChannelId)}\n${c.welcomeMessage.slice(0, 200)}`,
      },
      {
        name: "Goodbye",
        value: `${onOff(c.goodbyeEnabled)} · ${channelOrDash(c.goodbyeChannelId)}\n${c.goodbyeMessage.slice(0, 200)}`,
      },
      {
        name: "Invite tracker",
        value: `${onOff(c.invitesEnabled)} · log ${channelOrDash(c.invitesChannelId)}`,
        inline: true,
      },
      {
        name: "Autorole",
        value: c.autoRoleId ? `<@&${c.autoRoleId}>` : "not set",
        inline: true,
      },
      {
        name: "Mod log",
        value: channelOrDash(logChannelId),
        inline: true,
      },
    );
}

export const setupCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure welcome, goodbye, invites, templates, autorole, and logs")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("First-run: welcome, goodbye, invites, autorole, and logs in one go")
        .addChannelOption((o) =>
          o
            .setName("welcome")
            .setDescription("Welcome channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(false),
        )
        .addChannelOption((o) =>
          o
            .setName("goodbye")
            .setDescription("Goodbye channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(false),
        )
        .addChannelOption((o) =>
          o
            .setName("invites")
            .setDescription("Invite log channel (also turns tracking on)")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName("track_invites")
            .setDescription("Count who invited who")
            .setRequired(false),
        )
        .addRoleOption((o) =>
          o.setName("autorole").setDescription("Role given to new members").setRequired(false),
        )
        .addChannelOption((o) =>
          o
            .setName("logs")
            .setDescription("Moderation log channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(false),
        )
        .addStringOption((o) =>
          o.setName("color").setDescription("Embed color like #E8FF47").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("template")
        .setDescription("Install a channel/role layout into this server")
        .addStringOption((o) =>
          o
            .setName("preset")
            .setDescription("Knox layout")
            .addChoices(
              { name: "Gaming", value: "gaming" },
              { name: "Community", value: "community" },
              { name: "Study", value: "study" },
              { name: "Creator", value: "creator" },
            )
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("code")
            .setDescription("discord.new/CODE or template code")
            .setRequired(false),
        )
        .addBooleanOption((o) =>
          o
            .setName("apply")
            .setDescription("Create the channels and roles now")
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("save-template")
        .setDescription("Save this server as a Discord template you can reuse")
        .addStringOption((o) =>
          o.setName("name").setDescription("Template name").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Short description").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s.setName("view").setDescription("Show the current Knox setup"),
    )
    .addSubcommand((s) =>
      s
        .setName("welcome")
        .setDescription("Set welcome channel and message")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Welcome channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("message").setDescription("Welcome text").setRequired(false),
        )
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Turn welcome on/off").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("goodbye")
        .setDescription("Set goodbye channel and message")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Goodbye channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("message").setDescription("Goodbye text").setRequired(false),
        )
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Turn goodbye on/off").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("invites")
        .setDescription("Track who invited who")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Turn invite tracking on/off").setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Optional invite log channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("autorole")
        .setDescription("Role given to new members")
        .addRoleOption((o) =>
          o.setName("role").setDescription("Role to assign").setRequired(true),
        )
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Clear autorole if false").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("logs")
        .setDescription("Moderation log channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Log channel")
            .addChannelTypes(...TEXT_CHANNELS)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("color")
        .setDescription("Embed color as #hex")
        .addStringOption((o) =>
          o.setName("hex").setDescription("#E8FF47").setRequired(true),
        ),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });
    await ensureGuildSettings(ctx.client, {
      id: interaction.guild.id,
      name: interaction.guild.name,
      icon: interaction.guild.icon,
      ownerId: interaction.guild.ownerId,
    });
    const cached = await ctx.client.guildConfig.get(interaction.guild.id);
    let settings = cached.settings;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    const replySetup = async (next: GuildSettings, footer?: string) => {
      const embed = communityEmbed(next.embedColor, next.community, next.logChannelId);
      if (footer) embed.setFooter({ text: footer });
      await interaction.editReply({ embeds: [embed] });
    };

    const save = async (patch: GuildSettings) => {
      try {
        const next = await persistGuildSettings(ctx.client, guildId, patch);
        if (next.community.invitesEnabled) {
          await snapshotGuildInvites(ctx.client, guildId);
        }
        return next;
      } catch {
        await interaction.editReply({
          content: "That didn't save. Color must look like `#E8FF47`.",
        });
        return null;
      }
    };

    if (sub === "view") {
      await replySetup(settings);
      return;
    }

    if (sub === "template") {
      const blueprint = await resolveBlueprint(interaction);
      if (typeof blueprint === "string") {
        await interaction.editReply({ content: blueprint });
        return;
      }
      const applyNow = interaction.options.getBoolean("apply") ?? false;
      if (!applyNow) {
        stashPreview(guildId, interaction.user.id, blueprint);
        await interaction.editReply({
          embeds: [templatePreviewEmbed(settings.embedColor, blueprint)],
          components: [templateApplyRow()],
        });
        return;
      }
      const result = await installBlueprint(interaction.guild, blueprint);
      await interaction.editReply({
        embeds: [resultEmbed(settings.embedColor, blueprint, result)],
      });
      return;
    }

    if (sub === "save-template") {
      const name = interaction.options.getString("name", true);
      const description = interaction.options.getString("description");
      try {
        const existing = await interaction.guild.fetchTemplates();
        const current = existing.first();
        if (current) {
          await current.sync();
          await interaction.editReply({
            content: `This server already has a template. Synced it.\nhttps://discord.new/${current.code}`,
          });
          return;
        }
        const created = await interaction.guild.createTemplate(name, description ?? undefined);
        await interaction.editReply({
          content: `Template saved. Anyone can install it with \`/setup template code:${created.code}\`\nhttps://discord.new/${created.code}`,
        });
      } catch {
        await interaction.editReply({
          content:
            "Couldn't save a template. Knox needs **Manage Server**, and Discord only allows one template per server.",
        });
      }
      return;
    }

    if (sub === "start") {
      const welcome = interaction.options.getChannel("welcome");
      const goodbye = interaction.options.getChannel("goodbye");
      const invitesCh = interaction.options.getChannel("invites");
      const trackInvites = interaction.options.getBoolean("track_invites");
      const autorole = interaction.options.getRole("autorole");
      const logs = interaction.options.getChannel("logs");
      const color = interaction.options.getString("color")?.trim();
      const touched =
        welcome || goodbye || invitesCh || trackInvites !== null || autorole || logs || color;
      if (!touched) {
        await replySetup(settings, "Nothing changed — fill at least one option");
        return;
      }
      const next = await save({
        ...settings,
        embedColor: color || settings.embedColor,
        logChannelId: logs?.id ?? settings.logChannelId,
        community: {
          ...settings.community,
          welcomeEnabled: welcome ? true : settings.community.welcomeEnabled,
          welcomeChannelId: welcome?.id ?? settings.community.welcomeChannelId,
          goodbyeEnabled: goodbye ? true : settings.community.goodbyeEnabled,
          goodbyeChannelId: goodbye?.id ?? settings.community.goodbyeChannelId,
          invitesEnabled:
            invitesCh || trackInvites === true
              ? true
              : trackInvites === false
                ? false
                : settings.community.invitesEnabled,
          invitesChannelId: invitesCh?.id ?? settings.community.invitesChannelId,
          autoRoleId: autorole?.id ?? settings.community.autoRoleId,
        },
      });
      if (next) await replySetup(next, "Knox is set up for this server");
      return;
    }

    if (sub === "welcome") {
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message");
      const enabled = interaction.options.getBoolean("enabled") ?? true;
      const next = await save({
        ...settings,
        community: {
          ...settings.community,
          welcomeEnabled: enabled,
          welcomeChannelId: channel.id,
          welcomeMessage: message ?? settings.community.welcomeMessage,
        },
      });
      if (next) await replySetup(next, "Updated welcome");
      return;
    }

    if (sub === "goodbye") {
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message");
      const enabled = interaction.options.getBoolean("enabled") ?? true;
      const next = await save({
        ...settings,
        community: {
          ...settings.community,
          goodbyeEnabled: enabled,
          goodbyeChannelId: channel.id,
          goodbyeMessage: message ?? settings.community.goodbyeMessage,
        },
      });
      if (next) await replySetup(next, "Updated goodbye");
      return;
    }

    if (sub === "invites") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const channel = interaction.options.getChannel("channel");
      const next = await save({
        ...settings,
        community: {
          ...settings.community,
          invitesEnabled: enabled,
          invitesChannelId: channel?.id ?? settings.community.invitesChannelId,
        },
      });
      if (next) await replySetup(next, "Updated invite tracker");
      return;
    }

    if (sub === "autorole") {
      const role = interaction.options.getRole("role", true);
      const enabled = interaction.options.getBoolean("enabled") ?? true;
      const next = await save({
        ...settings,
        community: {
          ...settings.community,
          autoRoleId: enabled ? role.id : null,
        },
      });
      if (next) await replySetup(next, "Updated autorole");
      return;
    }

    if (sub === "logs") {
      const channel = interaction.options.getChannel("channel", true);
      const next = await save({
        ...settings,
        logChannelId: channel.id,
      });
      if (next) await replySetup(next, "Updated logs");
      return;
    }

    if (sub === "color") {
      const hex = interaction.options.getString("hex", true).trim();
      const next = await save({
        ...settings,
        embedColor: hex,
      });
      if (next) await replySetup(next, "Updated color");
    }
  },
};
