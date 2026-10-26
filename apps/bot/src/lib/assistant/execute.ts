// Carrying out a plan: each action is checked against what the asking member may do (their Discord permission,
// role hierarchy, the bot's own reach), then done, and reported one line at a time.
import { ChannelType, OverwriteType, PermissionFlagsBits, type Guild, type GuildMember, type GuildTextBasedChannel, type NewsChannel, type NonThreadGuildBasedChannel, type OverwriteResolvable, type TextChannel } from "discord.js";
import type { KnoxClient } from "../../client.js";
import { logLine, notifyTarget } from "../../modules/moderation/lib/modlog.js";
import { plainName } from "../server-brain.js";
import { PERMISSION_FOR, describeAction, isHere, type Action } from "./actions.js";
import { resolveCategory, resolveChannel, resolveMember, resolveRole, type Created } from "./resolve.js";

export type Outcome = { ok: boolean; line: string };

function may(invoker: GuildMember, action: Action) {
  if (invoker.id === invoker.guild.ownerId || invoker.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return invoker.permissions.has(PERMISSION_FOR[action.type]);
}

/** the asker outranks the target (owner outranks everyone), and the target is neither the asker nor the owner */
function outranks(invoker: GuildMember, target: GuildMember) {
  if (target.id === invoker.id || target.id === invoker.guild.ownerId) return false;
  if (invoker.id === invoker.guild.ownerId) return true;
  return invoker.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

function roleWithinReach(invoker: GuildMember, role: { position: number; managed: boolean; editable: boolean; id: string }) {
  if (role.managed || role.id === invoker.guild.id || !role.editable) return false;
  return invoker.id === invoker.guild.ownerId || invoker.roles.highest.position > role.position;
}

export async function executePlan(client: KnoxClient, guild: Guild, invoker: GuildMember, origin: GuildTextBasedChannel, actions: Action[]): Promise<Outcome[]> {
  const created: Created = new Map();
  const outcomes: Outcome[] = [];
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const why = `ZARU assistant, asked by ${invoker.user.tag}`;
  for (const action of actions) {
    const what = describeAction(action);
    if (!may(invoker, action)) {
      outcomes.push({ ok: false, line: `${what}: you don't have the Discord permission for that.` });
      continue;
    }
    try {
      const line = await run(action, { client, guild, invoker, origin, me, created, why });
      outcomes.push({ ok: true, line: `${what}: ${line}` });
    } catch (err) {
      outcomes.push({ ok: false, line: `${what}: ${err instanceof Error ? err.message : "failed"}` });
    }
  }
  const cached = await client.guildConfig.get(guild.id);
  await logLine(guild, cached.settings, "Assistant", `${invoker.user.tag} asked ZARU to:\n${outcomes.map((o) => `${o.ok ? "✅" : "❌"} ${o.line}`).join("\n")}`.slice(0, 1900), 0x5865f2).catch(() => undefined);
  return outcomes;
}

type Ctx = { client: KnoxClient; guild: Guild; invoker: GuildMember; origin: GuildTextBasedChannel; me: GuildMember; created: Created; why: string };

const TEXTISH = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

/** a function declaration (not a const) so TypeScript treats every `if (bad) fail()` as a narrowing exit */
function fail(message: string): never {
  throw new Error(message);
}

/** the model writes "here" (or nothing) for the channel the instruction was given in */
function target(ref: string | undefined, origin: GuildTextBasedChannel) {
  return ref && !isHere(ref) ? ref : origin.id;
}

/** any real channel or category (not a thread) */
function guildChannel(guild: Guild, ref: string | undefined, created: Created): NonThreadGuildBasedChannel {
  const ch = resolveChannel(guild, ref, created) ?? fail(`I can't find a channel called ${ref ?? "?"}`);
  if (ch.isThread()) fail("that's a thread, not a channel");
  return ch;
}

/** a text or announcement channel */
function textChannel(guild: Guild, ref: string | undefined, created: Created): TextChannel | NewsChannel {
  const ch = resolveChannel(guild, ref, created, TEXTISH) ?? fail(`I can't find a text channel called ${ref ?? "?"}`);
  if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) fail("that isn't a text channel");
  return ch;
}

/** hide a channel from @everyone and hand it to one role: see + talk, or see + join for voice */
function privateOverwrites(guild: Guild, me: GuildMember, roleId: string, voice: boolean): OverwriteResolvable[] {
  return [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: roleId, allow: voice ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
  ];
}

async function run(action: Action, ctx: Ctx): Promise<string> {
  const { guild, invoker, created, why, me, origin } = ctx;
  const g = action.args;
  switch (action.type) {
    case "create_category": {
      const name = g.name ?? fail("no name given");
      const ch = await guild.channels.create({ name, type: ChannelType.GuildCategory, reason: why });
      created.set(plainName(name), ch.id);
      return `created **${ch.name}**`;
    }
    case "create_channel": {
      const name = g.name ?? fail("no name given");
      const category = g.category ? resolveCategory(guild, g.category, created) : null;
      if (g.category && !category) fail(`I can't find a category called ${g.category}`);
      const role = g.role ? resolveRole(guild, g.role, created) : null;
      if (g.role && !role) fail(`I can't find a role called ${g.role}`);
      const type = g.kind === "voice" ? ChannelType.GuildVoice : g.kind === "announcement" && guild.features.includes("COMMUNITY") ? ChannelType.GuildAnnouncement : ChannelType.GuildText;
      const voice = type === ChannelType.GuildVoice;
      const ch = await guild.channels.create({ name, type, parent: category ?? undefined, topic: type === ChannelType.GuildText ? g.topic : undefined, permissionOverwrites: role ? privateOverwrites(guild, me, role.id, voice) : [], reason: why });
      created.set(plainName(name), ch.id);
      return `created <#${ch.id}>${role ? `, only <@&${role.id}> can see and ${voice ? "join" : "chat in"} it` : ""}`;
    }
    case "create_role": {
      const name = g.name ?? fail("no name given");
      const color = g.color && /^#?[0-9a-f]{6}$/i.test(g.color) ? (`#${g.color.replace("#", "")}` as `#${string}`) : undefined;
      const role = await guild.roles.create({ name, color, hoist: g.hoist ?? false, mentionable: g.mentionable ?? false, reason: why });
      created.set(`role:${plainName(name)}`, role.id);
      return `created <@&${role.id}>`;
    }
    case "restrict_channel":
    case "open_channel": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (action.type === "open_channel") {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null }, { reason: why });
        return `<#${ch.id}> is visible to everyone again`;
      }
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      const voice = ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
      await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, { reason: why });
      await ch.permissionOverwrites.edit(role, voice ? { ViewChannel: true, Connect: true } : { ViewChannel: true, SendMessages: true }, { reason: why });
      await ch.permissionOverwrites.edit(me, voice ? { ViewChannel: true, Connect: true } : { ViewChannel: true, SendMessages: true }, { reason: why }).catch(() => undefined);
      const others = ch.permissionOverwrites.cache
        .filter((o) => o.type === OverwriteType.Role && o.id !== role.id && o.id !== guild.id && o.allow.has(PermissionFlagsBits.ViewChannel))
        .map((o) => `<@&${o.id}>`);
      return `only <@&${role.id}> can see and ${voice ? "join" : "chat in"} <#${ch.id}> now${others.length ? `; ${others.join(", ")} keep their own access` : ""}`;
    }
    case "rename_channel": {
      const ch = resolveChannel(guild, target(g.channel, origin), created) ?? fail(`I can't find a channel called ${g.channel ?? "?"}`);
      const name = g.name ?? fail("no new name given");
      await ch.setName(name, why);
      return `renamed to <#${ch.id}>`;
    }
    case "move_channel": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (ch.type === ChannelType.GuildCategory) fail("a category can't go inside another category");
      const category = resolveCategory(guild, g.category, created) ?? fail(`I can't find a category called ${g.category ?? "?"}`);
      await ch.setParent(category, { lockPermissions: false, reason: why });
      return `moved <#${ch.id}> under **${category.name}**`;
    }
    case "set_topic": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      await ch.setTopic(g.topic ?? "", why);
      return `topic set on <#${ch.id}>`;
    }
    case "set_slowmode": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      await ch.setRateLimitPerUser(g.seconds ?? 0, why);
      return `slowmode is ${g.seconds ?? 0}s in <#${ch.id}>`;
    }
    case "lock_channel":
    case "unlock_channel": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: action.type === "lock_channel" ? false : null }, { reason: why });
      return action.type === "lock_channel" ? `<#${ch.id}> is locked` : `<#${ch.id}> is open again`;
    }
    case "delete_channel": {
      if (!g.channel || isHere(g.channel)) fail("tell me which channel; I won't delete the one we're talking in");
      const ch = resolveChannel(guild, g.channel, created) ?? fail(`I can't find a channel called ${g.channel}`);
      if (ch.id === origin.id) fail("not the channel we're talking in");
      const name = ch.name;
      await ch.delete(why);
      return `deleted #${name}`;
    }
    case "give_role":
    case "remove_role": {
      const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member ?? "?"}`);
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (!roleWithinReach(invoker, role)) fail("that role is above you or me, or belongs to an integration");
      if (action.type === "give_role") {
        await member.roles.add(role, why);
        return `<@${member.id}> now has <@&${role.id}>`;
      }
      await member.roles.remove(role, why);
      return `<@${member.id}> no longer has <@&${role.id}>`;
    }
    case "delete_role": {
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (!roleWithinReach(invoker, role)) fail("that role is above you or me, or belongs to an integration");
      const name = role.name;
      await role.delete(why);
      return `deleted role ${name}`;
    }
    case "set_nickname": {
      const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member ?? "?"}`);
      if (member.id !== invoker.id && !outranks(invoker, member)) fail("they outrank you");
      if (!member.manageable) fail("their top role is above mine");
      await member.setNickname(g.name ?? null, why);
      return `<@${member.id}> is now called **${g.name ?? member.user.username}**`;
    }
    case "kick":
    case "ban":
    case "timeout":
    case "untimeout": {
      const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member ?? "?"}`);
      if (!outranks(invoker, member)) fail("they outrank you (or it's you, or the owner)");
      const reason = g.reason ?? `asked by ${invoker.user.tag}`;
      if (action.type === "kick") {
        if (!member.kickable) fail("I can't kick them: their top role is above mine");
        await notifyTarget(member.user, guild, "kicked", reason);
        await member.kick(`${reason} (${why})`);
        return `kicked <@${member.id}>`;
      }
      if (action.type === "ban") {
        if (!member.bannable) fail("I can't ban them: their top role is above mine");
        await notifyTarget(member.user, guild, "banned", reason);
        await member.ban({ reason: `${reason} (${why})` });
        return `banned <@${member.id}>`;
      }
      if (!member.moderatable) fail("I can't time them out: their top role is above mine");
      if (action.type === "untimeout") {
        await member.timeout(null, why);
        return `<@${member.id}> can talk again`;
      }
      const minutes = g.minutes ?? 10;
      await notifyTarget(member.user, guild, "timed out", reason, minutes * 60_000);
      await member.timeout(minutes * 60_000, `${reason} (${why})`);
      return `<@${member.id}> timed out for ${minutes} min`;
    }
    case "purge": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const deleted = await ch.bulkDelete(Math.min(100, g.amount ?? 10), true);
      return `deleted ${deleted.size} messages in <#${ch.id}>`;
    }
    case "send_message": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const text = g.text ?? fail("nothing to say");
      const everyone = invoker.permissions.has(PermissionFlagsBits.MentionEveryone);
      await ch.send({ content: text, allowedMentions: { parse: everyone ? ["users", "roles", "everyone"] : ["users", "roles"] } });
      return `posted in <#${ch.id}>`;
    }
    default:
      return fail("I don't know how to do that");
  }
}
