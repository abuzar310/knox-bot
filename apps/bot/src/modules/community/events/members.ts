import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, Events, type Guild, type GuildMember } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { detectInviter } from "../lib/invites.js";
import { countInvites, recordJoin } from "../lib/invite-store.js";
import { renderTemplate } from "../lib/template.js";
import { canGrantRole } from "../../../lib/roles.js";
import { bumpJoin, bumpLeave } from "../../../lib/stats.js";
import { renderWelcomeCard } from "../../../lib/cards.js";
import { streamChannelId } from "../../../lib/log-target.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { applyJoinStartBalance } from "../../levels/lib/join-economy.js";
import { ROLES_CHANNEL_NAME, isBoardEmbed, joinRoleAsk } from "../lib/join-roles.js";
import { restoreStickyRoles, saveStickyRoles } from "../lib/sticky-roles.js";

async function sendChannel(
  member: GuildMember,
  channelId: string | null,
  embedColor: string,
  title: string,
  description: string,
  image?: Buffer | null,
  buttons?: ActionRowBuilder<ButtonBuilder> | null,
) {
  if (!channelId) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const embed = knoxEmbed(embedColor).setTitle(title).setDescription(description);
  if (image) embed.setImage("attachment://card.png");
  await channel.send({
    embeds: [embed],
    files: image ? [new AttachmentBuilder(image, { name: "card.png" })] : [],
    components: buttons ? [buttons] : [],
    allowedMentions: { users: [member.id] },
  });
}

/** Rules, roles, and chat links, the same set Welcomer and Carl-bot put under a greeting */
function welcomeLinks(guild: Guild): ActionRowBuilder<ButtonBuilder> | null {
  const link = (names: string[], label: string) => {
    const channel = guild.channels.cache.find((ch) => names.includes(ch.name) && ch.isTextBased());
    if (!channel) return null;
    return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(`https://discord.com/channels/${guild.id}/${channel.id}`);
  };
  const buttons = [link(["rules"], "Rules"), link([ROLES_CHANNEL_NAME], "Roles"), link(["chat"], "Chat")].filter(
    (button): button is ButtonBuilder => button !== null,
  );
  return buttons.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) : null;
}

/** Carl-bot style: a new member is asked to pick gender, 18+ or 18-, and games. DMs fail closed. */
async function askJoinRoles(member: GuildMember) {
  await member.guild.channels.fetch().catch(() => undefined);
  const channel = member.guild.channels.cache.find((ch) => ch.name === ROLES_CHANNEL_NAME && ch.isTextBased() && !ch.isThread());
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  const recent = await channel.messages.fetch({ limit: 15 }).catch(() => null);
  const board = recent?.some((message) => message.author.id === member.client.user?.id && message.embeds.some((embed) => isBoardEmbed(embed)));
  if (!board) return;
  await member
    .send({
      content: joinRoleAsk(member.guild.name),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Pick your roles").setURL(`https://discord.com/channels/${member.guild.id}/${channel.id}`),
        ),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
}

export const memberAddEvent: KnoxBoundEvent = {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    const member = args[0] as GuildMember;
    if (member.user.bot) return;
    const client = member.client as KnoxClient;
    await applyJoinStartBalance(client, member).catch(() => undefined);
    bumpJoin(client, member.guild.id);
    const cached = await client.guildConfig.get(member.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    // the join gate (moderation) is turning this member away: no welcome, no invite credit
    if (client.gatedJoins.has(`${member.guild.id}:${member.id}`)) return;
    const community = cached.settings.community;
    const color = cached.settings.embedColor;

    let inviterId: string | null = null;
    let code: string | null = null;
    let inviteCount = 0;
    let inviterLabel = "unknown";

    if (community.invitesEnabled) {
      const detected = await detectInviter(client, member.guild.id);
      inviterId = detected.inviterId === "vanity" ? null : detected.inviterId;
      code = detected.code;
      await recordJoin(client.db, {
        guildId: member.guild.id,
        memberId: member.id,
        inviterId: detected.inviterId === "vanity" ? "vanity" : inviterId,
        code,
      });
      if (detected.inviterId === "vanity") {
        inviterLabel = "vanity URL";
      } else if (inviterId) {
        inviteCount = await countInvites(client.db, member.guild.id, inviterId);
        inviterLabel = `<@${inviterId}>`;
      }
    }

    if (community.autoRoleId) {
      const role = member.guild.roles.cache.get(community.autoRoleId);
      if (canGrantRole(role)) await member.roles.add(role).catch(() => undefined);
    }
    await restoreStickyRoles(client, member).catch(() => undefined);

    const ctx = {
      user: `${member}`,
      username: member.user.username,
      server: member.guild.name,
      membercount: String(member.guild.memberCount),
      inviter: inviterLabel,
      invites: String(inviteCount),
    };

    if (community.welcomeEnabled) {
      await member.guild.channels.fetch().catch(() => undefined);
      const card = community.welcomeCardEnabled
        ? await renderWelcomeCard({
            user: member.user,
            displayName: member.displayName,
            guildName: member.guild.name,
            memberCount: member.guild.memberCount,
            accent: color,
            backgroundUrl: community.welcomeBackgroundUrl,
            heading: community.welcomeCardHeading,
          })
        : null;
      await sendChannel(
        member,
        community.welcomeChannelId,
        color,
        "Welcome",
        renderTemplate(community.welcomeMessage, ctx),
        card,
        welcomeLinks(member.guild),
      );
    }

    if (community.welcomeDmMessage) {
      await member.send({ content: renderTemplate(community.welcomeDmMessage, ctx), allowedMentions: { parse: [] } }).catch(() => undefined);
    }
    await askJoinRoles(member);

    if (community.invitesEnabled && community.invitesChannelId) {
      await sendChannel(
        member,
        community.invitesChannelId,
        color,
        "Invite",
        `${member} joined via ${inviterLabel}${code ? ` (\`${code}\`)` : ""} · ${inviteCount} invites`,
      );
    }

    if (cached.settings.features.delayedRoles.length) {
      const due = Date.now();
      const extra = cached.settings.features.delayedRoles.map((row) => ({
        userId: member.id,
        roleId: row.roleId,
        dueAt: new Date(due + row.delayMinutes * 60_000).toISOString(),
      }));
      await persistGuildSettings(client, member.guild.id, {
        ...cached.settings,
        features: {
          ...cached.settings.features,
          pendingDelayedRoles: [...cached.settings.features.pendingDelayedRoles, ...extra].slice(-80),
        },
      }).catch(() => undefined);
    }

    const joinLog = streamChannelId(cached.settings, "joins");
    if (cached.settings.features.logMembers && joinLog) {
      await sendChannel(
        member,
        joinLog,
        color,
        "Member joined",
        `${member} (${member.user.tag}) · account created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>${
          Date.now() - member.user.createdTimestamp < 7 * 86_400_000 ? " · 🆕 new account" : ""
        }`,
      );
    }
  },
};

export const memberRemoveEvent: KnoxBoundEvent = {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const member = args[0] as GuildMember;
    if (member.user.bot) return;
    const client = member.client as KnoxClient;
    bumpLeave(client, member.guild.id);
    await saveStickyRoles(client, member).catch(() => undefined);
    const cached = await client.guildConfig.get(member.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const community = cached.settings.community;
    const color = cached.settings.embedColor;

    if (community.goodbyeEnabled) {
      await sendChannel(
        member,
        community.goodbyeChannelId,
        color,
        "Goodbye",
        renderTemplate(community.goodbyeMessage, {
          user: `${member.user}`,
          username: member.user.username,
          server: member.guild.name,
          membercount: String(member.guild.memberCount),
          inviter: "—",
          invites: "—",
        }),
      );
    }

    const joinLog = streamChannelId(cached.settings, "joins");
    if (cached.settings.features.logMembers && joinLog) {
      await sendChannel(
        member,
        joinLog,
        color,
        "Member left",
        `${member.user.tag} (${member.id})`,
      );
    }
  },
};
