// VoiceMaster-style control panel for the "join to create" rooms. When a room is made, ZARU posts a panel of
// buttons into the room's own text chat: lock, hide, limit, rename, bitrate, claim, permit, reject, transfer, delete.
// Only the room's owner (or a member with Manage Channels) can use them; claim works when the owner has left.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type VoiceChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import { tempVoiceChannels } from "@knox/db";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { resolveMember } from "./assistant/resolve.js";

export const VC_PREFIX = "knox:vc:";
const P = PermissionFlagsBits;

export function voicePanel(ownerId: string) {
  const embed = knoxEmbed("#5865f2")
    .setTitle("🎙️ Voice control")
    .setDescription(`This room belongs to <@${ownerId}>. Use the buttons to manage it.`)
    .addFields(
      { name: "🔒 / 🔓", value: "Lock / unlock (who can join)", inline: true },
      { name: "👻 / 👁️", value: "Hide / reveal the room", inline: true },
      { name: "➕ Claim", value: "Take over if the owner left", inline: true },
      { name: "🔢 / ✏️ / 🔊", value: "Limit / rename / bitrate", inline: true },
      { name: "✅ / ⛔", value: "Permit / reject a member", inline: true },
      { name: "👑 / 🗑️", value: "Transfer / delete", inline: true },
    );
  const btn = (id: string, label: string, emoji: string, style: ButtonStyle = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(VC_PREFIX + id).setLabel(label).setEmoji(emoji).setStyle(style);
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(btn("lock", "Lock", "🔒"), btn("unlock", "Unlock", "🔓"), btn("hide", "Hide", "👻"), btn("reveal", "Reveal", "👁️"), btn("claim", "Claim", "➕", ButtonStyle.Success)),
      new ActionRowBuilder<ButtonBuilder>().addComponents(btn("limit", "Limit", "🔢"), btn("rename", "Rename", "✏️"), btn("bitrate", "Bitrate", "🔊"), btn("permit", "Permit", "✅"), btn("reject", "Reject", "⛔")),
      new ActionRowBuilder<ButtonBuilder>().addComponents(btn("transfer", "Transfer", "👑"), btn("info", "Info", "ℹ️"), btn("delete", "Delete", "🗑️", ButtonStyle.Danger)),
    ],
  };
}

/** who owns a room: the in-memory map first, then the database row */
async function ownerOf(client: KnoxClient, channelId: string): Promise<string | null> {
  const cached = client.tempVoiceOwners.get(channelId);
  if (cached) return cached;
  const [row] = await client.db.select({ ownerId: tempVoiceChannels.ownerId }).from(tempVoiceChannels).where(eq(tempVoiceChannels.channelId, channelId)).catch(() => []);
  if (row) client.tempVoiceOwners.set(channelId, row.ownerId);
  return row?.ownerId ?? null;
}

async function setOwner(client: KnoxClient, channelId: string, ownerId: string) {
  client.tempVoiceOwners.set(channelId, ownerId);
  await client.db.update(tempVoiceChannels).set({ ownerId }).where(eq(tempVoiceChannels.channelId, channelId)).catch(() => undefined);
}

const modal = (id: string, title: string, label: string, placeholder: string, style = TextInputStyle.Short) =>
  new ModalBuilder().setCustomId(VC_PREFIX + id).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("value").setLabel(label).setStyle(style).setPlaceholder(placeholder).setRequired(true).setMaxLength(100)),
  );

export async function handleVoiceButton(interaction: ButtonInteraction, client: KnoxClient) {
  const action = interaction.customId.slice(VC_PREFIX.length);
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice || !interaction.guild) {
    await interaction.reply({ content: "Use these controls inside your voice room's chat.", ephemeral: true });
    return;
  }
  const vc = channel as VoiceChannel;
  const owner = await ownerOf(client, vc.id);
  const member = interaction.guild.members.cache.get(interaction.user.id) ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));
  const isManager = member?.permissions.has(P.ManageChannels) ?? false;
  const everyone = interaction.guild.roles.everyone;

  // claim: anyone in the room may take it when the owner is not connected
  if (action === "claim") {
    if (owner && vc.members.has(owner)) {
      await interaction.reply({ content: `The owner <@${owner}> is still here, so the room can't be claimed.`, ephemeral: true });
      return;
    }
    if (!vc.members.has(interaction.user.id)) {
      await interaction.reply({ content: "Join the room first, then claim it.", ephemeral: true });
      return;
    }
    await setOwner(client, vc.id, interaction.user.id);
    await interaction.reply({ content: "You own this room now. 👑", ephemeral: true });
    return;
  }

  if (interaction.user.id !== owner && !isManager) {
    await interaction.reply({ content: `Only the room owner (<@${owner ?? "?"}>) can use that. Press ➕ Claim if they've left.`, ephemeral: true });
    return;
  }

  // modal actions
  if (action === "limit") return interaction.showModal(modal("limit", "User limit", "How many people? (0 = no limit)", "e.g. 5"));
  if (action === "rename") return interaction.showModal(modal("rename", "Rename the room", "New name", vc.name));
  if (action === "bitrate") return interaction.showModal(modal("bitrate", "Bitrate", "kbps (8–96, boosted servers higher)", "64"));
  if (action === "permit") return interaction.showModal(modal("permit", "Permit a member", "Who may join? (name or id)", "@someone"));
  if (action === "reject") return interaction.showModal(modal("reject", "Reject a member", "Who to remove and block? (name or id)", "@someone"));
  if (action === "transfer") return interaction.showModal(modal("transfer", "Transfer ownership", "New owner (name or id)", "@someone"));

  // instant actions
  const why = `Voice control by ${interaction.user.tag}`;
  if (action === "lock") {
    await vc.permissionOverwrites.edit(everyone, { Connect: false }, { reason: why });
    await interaction.reply({ content: "🔒 Locked — no one new can join.", ephemeral: true });
  } else if (action === "unlock") {
    await vc.permissionOverwrites.edit(everyone, { Connect: null }, { reason: why });
    await interaction.reply({ content: "🔓 Unlocked.", ephemeral: true });
  } else if (action === "hide") {
    await vc.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: why });
    await interaction.reply({ content: "👻 Hidden from everyone else.", ephemeral: true });
  } else if (action === "reveal") {
    await vc.permissionOverwrites.edit(everyone, { ViewChannel: null }, { reason: why });
    await interaction.reply({ content: "👁️ Visible again.", ephemeral: true });
  } else if (action === "info") {
    const locked = vc.permissionOverwrites.cache.get(everyone.id)?.deny.has(P.Connect) ?? false;
    const hidden = vc.permissionOverwrites.cache.get(everyone.id)?.deny.has(P.ViewChannel) ?? false;
    await interaction.reply({
      embeds: [knoxEmbed("#5865f2").setTitle(`🎙️ ${vc.name}`).setDescription(`Owner: <@${owner ?? "?"}>\nMembers: ${vc.members.size}${vc.userLimit ? ` / ${vc.userLimit}` : ""}\nBitrate: ${vc.bitrate / 1000} kbps\nLocked: ${locked ? "yes" : "no"} · Hidden: ${hidden ? "yes" : "no"}`)],
      ephemeral: true,
    });
  } else if (action === "delete") {
    await interaction.reply({ content: "Deleting this room…", ephemeral: true });
    await vc.delete("Voice control: owner deleted the room").catch(() => undefined);
  }
}

export async function handleVoiceModal(interaction: ModalSubmitInteraction, client: KnoxClient) {
  const action = interaction.customId.slice(VC_PREFIX.length);
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice || !interaction.guild) {
    await interaction.reply({ content: "That room is gone.", ephemeral: true });
    return;
  }
  const vc = channel as VoiceChannel;
  const value = interaction.fields.getTextInputValue("value").trim();
  const why = `Voice control by ${interaction.user.tag}`;

  if (action === "limit") {
    const n = Math.max(0, Math.min(99, parseInt(value, 10) || 0));
    await vc.setUserLimit(n, why);
    await interaction.reply({ content: n ? `🔢 Limit set to ${n}.` : "🔢 Limit removed.", ephemeral: true });
    return;
  }
  if (action === "rename") {
    await vc.setName(value.slice(0, 100), why);
    await interaction.reply({ content: `✏️ Renamed to **${value.slice(0, 100)}**.`, ephemeral: true });
    return;
  }
  if (action === "bitrate") {
    const kbps = Math.max(8, Math.min(Math.floor(interaction.guild.maximumBitrate / 1000), parseInt(value, 10) || 64));
    await vc.setBitrate(kbps * 1000, why);
    await interaction.reply({ content: `🔊 Bitrate set to ${kbps} kbps.`, ephemeral: true });
    return;
  }
  const target = await resolveMember(interaction.guild, value);
  if (!target) {
    await interaction.reply({ content: `I can't find a member called "${value}".`, ephemeral: true });
    return;
  }
  if (action === "permit") {
    await vc.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true }, { reason: why });
    await interaction.reply({ content: `✅ <@${target.id}> may now join.`, ephemeral: true });
  } else if (action === "reject") {
    await vc.permissionOverwrites.edit(target.id, { Connect: false }, { reason: why });
    if (target.voice.channelId === vc.id) await target.voice.disconnect(why).catch(() => undefined);
    await interaction.reply({ content: `⛔ <@${target.id}> was removed and blocked.`, ephemeral: true });
  } else if (action === "transfer") {
    await setOwner(client, vc.id, target.id);
    await interaction.reply({ content: `👑 <@${target.id}> owns the room now.`, ephemeral: true });
  }
}
