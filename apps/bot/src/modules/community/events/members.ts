import { Events, type GuildMember } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { detectInviter } from "../lib/invites.js";
import { countInvites, recordJoin } from "../lib/invite-store.js";
import { renderTemplate } from "../lib/template.js";
import { canGrantRole } from "../../../lib/roles.js";
import { bumpJoin, bumpLeave } from "../../../lib/stats.js";

async function sendChannel(
  member: GuildMember,
  channelId: string | null,
  embedColor: string,
  title: string,
  description: string,
) {
  if (!channelId) return;
  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  await channel.send({
    embeds: [knoxEmbed(embedColor).setTitle(title).setDescription(description)],
  });
}

export const memberAddEvent: KnoxBoundEvent = {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    const member = args[0] as GuildMember;
    if (member.user.bot) return;
    const client = member.client as KnoxClient;
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

    const ctx = {
      user: `${member}`,
      username: member.user.username,
      server: member.guild.name,
      membercount: String(member.guild.memberCount),
      inviter: inviterLabel,
      invites: String(inviteCount),
    };

    if (community.welcomeEnabled) {
      await sendChannel(
        member,
        community.welcomeChannelId,
        color,
        "Welcome",
        renderTemplate(community.welcomeMessage, ctx),
      );
    }

    if (community.invitesEnabled && community.invitesChannelId) {
      await sendChannel(
        member,
        community.invitesChannelId,
        color,
        "Invite",
        `${member} joined via ${inviterLabel}${code ? ` (\`${code}\`)` : ""} · ${inviteCount} invites`,
      );
    }

    if (cached.settings.features.logMembers && cached.settings.logChannelId) {
      await sendChannel(
        member,
        cached.settings.logChannelId,
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

    if (cached.settings.features.logMembers && cached.settings.logChannelId) {
      await sendChannel(
        member,
        cached.settings.logChannelId,
        color,
        "Member left",
        `${member.user.tag} (${member.id})`,
      );
    }
  },
};
