// Applies a tidy plan: missing essentials are created, stray channels are put under categories. Nothing is deleted,
// renamed or moved out of a category it already has.
import { ChannelType, PermissionFlagsBits, type CategoryChannel, type Guild } from "discord.js";
import type { TidyAction } from "./server-brain.js";

export type TidyResult = { done: string[]; skipped: string[] };

export async function applyTidy(guild: Guild, plan: TidyAction[], actorTag: string): Promise<TidyResult> {
  const result: TidyResult = { done: [], skipped: [] };
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    result.skipped.push("I need **Manage Channels** to tidy up.");
    return result;
  }
  const categoryByName = async (name: string): Promise<CategoryChannel | null> => {
    const existing = guild.channels.cache.find((c): c is CategoryChannel => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const created = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: `Tidy-up by ${actorTag}` }).catch(() => null);
    if (created) result.done.push(`Created the **${created.name}** category.`);
    return created;
  };
  for (const action of plan.slice(0, 40)) {
    if (action.action === "create_channel") {
      if (guild.channels.cache.some((c) => c.name.toLowerCase() === action.name.toLowerCase())) {
        result.skipped.push(`#${action.name} already exists.`);
        continue;
      }
      const category = action.purpose === "rules" || action.purpose === "announcements" || action.purpose === "welcome" ? await categoryByName("Info") : null;
      const readOnly = action.purpose === "rules" || action.purpose === "announcements";
      const created = await guild.channels
        .create({
          name: action.name,
          type: action.purpose === "announcements" && guild.features.includes("COMMUNITY") ? ChannelType.GuildAnnouncement : ChannelType.GuildText,
          parent: category ?? undefined,
          permissionOverwrites: readOnly && me.permissions.has(PermissionFlagsBits.ManageRoles) ? [{ id: guild.id, deny: [PermissionFlagsBits.SendMessages] }] : [],
          reason: `Tidy-up by ${actorTag}`,
        })
        .catch(() => null);
      if (created) result.done.push(`Created <#${created.id}> (${action.purpose}).`);
      else result.skipped.push(`Couldn't create #${action.name}.`);
      continue;
    }
    const channel = guild.channels.cache.get(action.channelId);
    if (!channel || channel.isThread() || channel.type === ChannelType.GuildCategory) {
      result.skipped.push("A channel in the plan no longer exists.");
      continue;
    }
    if (channel.parentId) {
      result.skipped.push(`<#${channel.id}> already has a category.`);
      continue;
    }
    const category = await categoryByName(action.category);
    if (!category) {
      result.skipped.push(`Couldn't create the ${action.category} category.`);
      continue;
    }
    const moved = await channel.setParent(category, { lockPermissions: false, reason: `Tidy-up by ${actorTag}` }).then(() => true, () => false);
    if (moved) result.done.push(`Moved <#${channel.id}> under **${category.name}**.`);
    else result.skipped.push(`Couldn't move <#${channel.id}>.`);
  }
  return result;
}
