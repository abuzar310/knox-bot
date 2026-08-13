import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type GuildChannelCreateOptions,
  type OverwriteData,
} from "discord.js";
import type { ServerBlueprint } from "./server-blueprint.js";

const DELAY_MS = 350;
const MAX_NEW_CHANNELS = 80;

export type ApplyTemplateResult = {
  createdRoles: string[];
  skippedRoles: string[];
  createdChannels: string[];
  skippedChannels: string[];
  errors: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function existingRoleId(guild: Guild, name: string) {
  return guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id;
}

function existingChannel(
  guild: Guild,
  name: string,
  parentId: string | null,
  type: ChannelType,
) {
  return guild.channels.cache.find((ch) => {
    if (ch.name.toLowerCase() !== name.toLowerCase()) return false;
    if (ch.type !== type) return false;
    if (ch.isDMBased()) return false;
    const currentParent = "parentId" in ch ? (ch.parentId ?? null) : null;
    return currentParent === parentId;
  });
}

export async function applyServerTemplate(
  guild: Guild,
  blueprint: ServerBlueprint,
): Promise<ApplyTemplateResult> {
  const result: ApplyTemplateResult = {
    createdRoles: [],
    skippedRoles: [],
    createdChannels: [],
    skippedChannels: [],
    errors: [],
  };

  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    result.errors.push("ZARU needs **Manage Roles**");
    return result;
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    result.errors.push("ZARU needs **Manage Channels**");
    return result;
  }

  const idMap = new Map<string, string>();
  idMap.set("0", guild.id);

  for (const role of blueprint.roles) {
    const already = existingRoleId(guild, role.name);
    if (already) {
      idMap.set(role.placeholderId, already);
      result.skippedRoles.push(role.name);
      continue;
    }
    try {
      const created = await guild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist ?? false,
        mentionable: role.mentionable ?? false,
        permissions: role.permissions == null ? undefined : BigInt(role.permissions),
        reason: `ZARU template: ${blueprint.name}`,
      });
      idMap.set(role.placeholderId, created.id);
      result.createdRoles.push(role.name);
      await sleep(DELAY_MS);
    } catch (err) {
      result.errors.push(`role ${role.name}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const categories = blueprint.channels.filter((c) => c.type === ChannelType.GuildCategory);
  const rest = blueprint.channels.filter((c) => c.type !== ChannelType.GuildCategory);

  const createOne = async (channel: (typeof blueprint.channels)[number], parentId: string | null) => {
    if (result.createdChannels.length >= MAX_NEW_CHANNELS) {
      result.errors.push(`Stopped at ${MAX_NEW_CHANNELS} new channels`);
      return;
    }
    const already = existingChannel(guild, channel.name, parentId, channel.type);
    if (already) {
      idMap.set(channel.placeholderId, already.id);
      result.skippedChannels.push(channel.name);
      return;
    }

    const overwrites: OverwriteData[] = [];
    for (const ow of channel.overwrites ?? []) {
      const targetId = idMap.get(ow.placeholderId);
      if (!targetId) continue;
      overwrites.push({
        id: targetId,
        type: OverwriteType.Role,
        allow: BigInt(ow.allow),
        deny: BigInt(ow.deny),
      });
    }

    const options = {
      name: channel.name,
      type: channel.type,
      topic: channel.topic ?? undefined,
      nsfw: channel.nsfw,
      bitrate: channel.bitrate,
      userLimit: channel.userLimit,
      rateLimitPerUser: channel.slowmode,
      parent: parentId ?? undefined,
      permissionOverwrites: overwrites.length ? overwrites : undefined,
      reason: `ZARU template: ${blueprint.name}`,
    } as GuildChannelCreateOptions;

    try {
      const created = await guild.channels.create(options);
      idMap.set(channel.placeholderId, created.id);
      result.createdChannels.push(channel.name);
      await sleep(DELAY_MS);
    } catch (err) {
      result.errors.push(
        `channel ${channel.name}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  };

  for (const category of categories) {
    await createOne(category, null);
  }
  for (const channel of rest) {
    const parentId = channel.parentPlaceholderId
      ? (idMap.get(channel.parentPlaceholderId) ?? null)
      : null;
    await createOne(channel, parentId);
  }

  return result;
}
