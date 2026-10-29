// Reaction self-roles and suggestion vote counts. Both listen to the same Discord event.
import { Events, type MessageReaction, type PartialMessageReaction, type User } from "discord.js";
import { and, eq } from "drizzle-orm";
import { suggestions, tempRoles } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { planEmojiRole } from "../../../lib/emoji-role-plan.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";

function emojiMatches(stored: string, reaction: MessageReaction): boolean {
  const custom = stored.match(/<?a?:(\w+):(\d+)>?/);
  if (custom?.[2]) return reaction.emoji.id === custom[2];
  return reaction.emoji.name === stored || reaction.emoji.toString() === stored;
}

async function ready(reaction: MessageReaction | PartialMessageReaction, user: User) {
  if (user.bot) return null;
  if (reaction.partial) {
    const fetched = await reaction.fetch().catch(() => null);
    if (!fetched) return null;
    reaction = fetched;
  }
  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!message?.guild) return null;
  return { reaction: reaction as MessageReaction, message, user };
}

export const emojiRoleEvent: KnoxBoundEvent = {
  name: Events.MessageReactionAdd,
  async execute(...args: unknown[]) {
    const readyReaction = await ready(args[0] as MessageReaction | PartialMessageReaction, args[1] as User);
    if (!readyReaction) return;
    const { reaction, message, user } = readyReaction;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild!.id);
    const panel = cached.settings.features.emojiRolePanels.find((row) => row.messageId === message.id);
    if (!panel) return;
    const pair = panel.pairs.find((row) => emojiMatches(row.emoji, reaction));
    if (!pair) return;
    const member = await message.guild!.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const plan = planEmojiRole({
      mode: panel.mode,
      roleId: pair.roleId,
      panelRoleIds: panel.pairs.map((row) => row.roleId),
      memberRoleIds: [...member.roles.cache.keys()],
      requiredRoleId: panel.requiredRoleId,
      adding: true,
    });
    if (plan.error) {
      await user.send(plan.error).catch(() => undefined);
      if (plan.dropReaction) await reaction.users.remove(user.id).catch(() => undefined);
      return;
    }
    const problem = plan.add.length ? await roleIdGrantProblem(message.guild!, pair.roleId) : null;
    if (problem) return;
    if (plan.remove.length) await member.roles.remove(plan.remove, "Self-role").catch(() => undefined);
    if (plan.add.length) await member.roles.add(plan.add, "Self-role").catch(() => undefined);
    if (panel.mode === "unique") {
      for (const other of panel.pairs) {
        if (other.roleId === pair.roleId) continue;
        const existing = message.reactions.cache.find((row) => emojiMatches(other.emoji, row));
        await existing?.users.remove(user.id).catch(() => undefined);
      }
    }
    if (plan.dropReaction) await reaction.users.remove(user.id).catch(() => undefined);
    if (panel.mode === "temporary" && plan.add.length && panel.durationMinutes) {
      const expiresAt = new Date(Date.now() + panel.durationMinutes * 60_000);
      await client.db
        .insert(tempRoles)
        .values({
          guildId: message.guild!.id,
          userId: user.id,
          roleId: pair.roleId,
          expiresAt,
          grantedBy: client.user?.id ?? user.id,
          reason: "Temporary self-role",
        })
        .onConflictDoUpdate({
          target: [tempRoles.guildId, tempRoles.userId, tempRoles.roleId],
          set: { expiresAt, reason: "Temporary self-role" },
        })
        .catch(() => undefined);
    }
  },
};

export const emojiRoleRemoveEvent: KnoxBoundEvent = {
  name: Events.MessageReactionRemove,
  async execute(...args: unknown[]) {
    const readyReaction = await ready(args[0] as MessageReaction | PartialMessageReaction, args[1] as User);
    if (!readyReaction) return;
    const { reaction, message, user } = readyReaction;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild!.id);
    const panel = cached.settings.features.emojiRolePanels.find((row) => row.messageId === message.id);
    if (!panel) return;
    const pair = panel.pairs.find((row) => emojiMatches(row.emoji, reaction));
    if (!pair) return;
    const member = await message.guild!.members.fetch(user.id).catch(() => undefined);
    if (!member) return;
    const plan = planEmojiRole({
      mode: panel.mode,
      roleId: pair.roleId,
      panelRoleIds: panel.pairs.map((row) => row.roleId),
      memberRoleIds: [...member.roles.cache.keys()],
      requiredRoleId: panel.requiredRoleId,
      adding: false,
    });
    if (plan.remove.length) await member.roles.remove(plan.remove, "Self-role removed").catch(() => undefined);
    if (plan.add.length) await member.roles.add(plan.add, "Self-role").catch(() => undefined);
  },
};

async function syncSuggestionVotes(reaction: MessageReaction | PartialMessageReaction, user: User) {
  const readyReaction = await ready(reaction, user);
  if (!readyReaction) return;
  const { message } = readyReaction;
  const name = readyReaction.reaction.emoji.name;
  if (name !== "👍" && name !== "👎") return;
  const client = message.client as KnoxClient;
  const [row] = await client.db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.guildId, message.guild!.id), eq(suggestions.messageId, message.id)))
    .limit(1);
  if (!row || row.status !== "open") return;
  const up = Math.max(0, (message.reactions.cache.get("👍")?.count ?? 0) - 1);
  const down = Math.max(0, (message.reactions.cache.get("👎")?.count ?? 0) - 1);
  const embed = message.embeds[0];
  if (!embed) return;
  await message
    .edit({
      embeds: [
        knoxEmbed((await client.guildConfig.get(message.guild!.id)).settings.embedColor)
          .setTitle(embed.title ?? `Suggestion #${row.id}`)
          .setDescription(embed.description ?? row.content)
          .setFooter({ text: `${message.guild!.members.cache.get(row.userId)?.user.username ?? "member"} · open · 👍 ${up} · 👎 ${down}` }),
      ],
    })
    .catch(() => undefined);
}

export const suggestionVoteEvent: KnoxBoundEvent = {
  name: Events.MessageReactionAdd,
  async execute(...args: unknown[]) {
    await syncSuggestionVotes(args[0] as MessageReaction, args[1] as User);
  },
};

export const suggestionVoteRemoveEvent: KnoxBoundEvent = {
  name: Events.MessageReactionRemove,
  async execute(...args: unknown[]) {
    await syncSuggestionVotes(args[0] as MessageReaction, args[1] as User);
  },
};
