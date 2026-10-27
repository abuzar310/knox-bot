// Carrying out a plan: each action is checked against what the asking member may do (their Discord permission,
// role hierarchy, the bot's own reach), then done, and reported one line at a time.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildVerificationLevel,
  OverwriteType,
  PermissionFlagsBits,
  Role,
  ThreadAutoArchiveDuration,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type NewsChannel,
  type NonThreadGuildBasedChannel,
  type OverwriteResolvable,
  type PermissionOverwriteOptions,
  type TextChannel,
} from "discord.js";
import { and, count, eq } from "drizzle-orm";
import type { GuildSettings } from "@knox/config";
import { autoResponses, customTags, feedSubscriptions, giveaways, reminders, scheduledPosts, stickyMessages, type FeedKind } from "@knox/db";
import type { KnoxClient } from "../../client.js";
import { persistGuildSettings } from "../../config/save-settings.js";
import { knoxEmbed } from "../../interactions/embed.js";
import { KIND_LABEL, MAX_FEEDS, resolveSource } from "../../modules/alerts/commands/feed.js";
import { GIVEAWAY_JOIN_ID } from "../../modules/community/commands/giveaway.js";
import { normalizeTrigger, reloadGuildAutoResponses } from "../../modules/community/lib/auto-responses.js";
import { repostSticky } from "../../modules/community/lib/engagement.js";
import { panelComponents } from "../../modules/community/lib/ticket-open.js";
import { createCase } from "../../modules/moderation/lib/cases.js";
import { applyWarnEscalation } from "../../modules/moderation/lib/escalation.js";
import { lockdownGuild } from "../../modules/moderation/lib/lockdown.js";
import { logLine, notifyTarget, sendModLog } from "../../modules/moderation/lib/modlog.js";
import { syncBlockedWordsRule } from "../../modules/moderation/lib/native-automod.js";
import { disableRaidMode, enableRaidMode } from "../../modules/moderation/lib/raid.js";
import { aiProvider } from "../ai-moderation.js";
import { HINGLISH_ABUSE, normalizeWords } from "../safety/blocked-words.js";
import { REPEATS, describeRule, nextRun, type Repeat } from "../schedule.js";
import { plainName } from "../server-brain.js";
import { addWallet, addXp, takeWallet } from "../xp.js";
import { PERMISSION_FOR, describeAction, isHere, type Action } from "./actions.js";
import { resolveCategory, resolveChannel, resolveMember, resolveRole, type Created } from "./resolve.js";
import { SETTINGS, TOGGLES, applySetting, applyText, applyToggle, normalize, settingLabel } from "./settings-map.js";

export type Outcome = { ok: boolean; line: string };

const P = PermissionFlagsBits;

function may(invoker: GuildMember, action: Action) {
  if (invoker.id === invoker.guild.ownerId || invoker.permissions.has(P.Administrator)) return true;
  return invoker.permissions.has(PERMISSION_FOR[action.type]);
}

/** the asker outranks the target (owner outranks everyone), and the target is neither the asker nor the owner */
function outranks(invoker: GuildMember, target: GuildMember) {
  if (target.id === invoker.id || target.id === invoker.guild.ownerId) return false;
  if (invoker.id === invoker.guild.ownerId) return true;
  return invoker.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

function roleWithinReach(invoker: GuildMember, role: Role) {
  if (role.managed || role.id === invoker.guild.id || !role.editable) return false;
  return invoker.id === invoker.guild.ownerId || invoker.roles.highest.position > role.position;
}

export async function executePlan(client: KnoxClient, guild: Guild, invoker: GuildMember, origin: GuildTextBasedChannel, actions: Action[], attachments: string[] = []): Promise<Outcome[]> {
  const created: Created = new Map();
  const outcomes: Outcome[] = [];
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const cached = await client.guildConfig.get(guild.id);
  const ctx: Ctx = { client, guild, invoker, origin, me, created, why: `ZARU assistant, asked by ${invoker.user.tag}`, settings: cached.settings, attachments };
  for (const action of actions) {
    const what = describeAction(action);
    if (!may(invoker, action)) {
      outcomes.push({ ok: false, line: `${what}: you don't have the Discord permission for that.` });
      continue;
    }
    try {
      const line = await run(action, ctx);
      outcomes.push({ ok: true, line: `${what}: ${line}` });
    } catch (err) {
      outcomes.push({ ok: false, line: `${what}: ${err instanceof Error ? err.message : "failed"}` });
    }
  }
  await logLine(guild, ctx.settings, "Assistant", `${invoker.user.tag} asked ZARU to:\n${outcomes.map((o) => `${o.ok ? "✅" : "❌"} ${o.line}`).join("\n")}`.slice(0, 1900), 0x5865f2).catch(() => undefined);
  return outcomes;
}

type Ctx = { client: KnoxClient; guild: Guild; invoker: GuildMember; origin: GuildTextBasedChannel; me: GuildMember; created: Created; why: string; settings: GuildSettings; attachments: string[] };

const TEXTISH = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const VOICEISH = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

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
    { id: guild.id, deny: [P.ViewChannel] },
    { id: roleId, allow: voice ? [P.ViewChannel, P.Connect] : [P.ViewChannel, P.SendMessages] },
    { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels] },
  ];
}

const idFrom = (ref: string) => ref.match(/\d{17,20}/)?.[0];
const parseColor = (color?: string) => (color && /^#?[0-9a-f]{6}$/i.test(color) ? (`#${color.replace("#", "")}` as `#${string}`) : undefined);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const stamp = (d: Date, style = "F") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;
const isHttp = (s?: string) => !!s && /^https?:\/\//i.test(s);

/** plain words for channel permissions, the way staff say them */
const PERMISSION_NAMES: Record<string, bigint> = {
  view: P.ViewChannel,
  see: P.ViewChannel,
  read: P.ViewChannel,
  view_channel: P.ViewChannel,
  send: P.SendMessages,
  chat: P.SendMessages,
  talk: P.SendMessages,
  write: P.SendMessages,
  post: P.SendMessages,
  send_messages: P.SendMessages,
  history: P.ReadMessageHistory,
  read_history: P.ReadMessageHistory,
  read_message_history: P.ReadMessageHistory,
  attach: P.AttachFiles,
  files: P.AttachFiles,
  images: P.AttachFiles,
  attach_files: P.AttachFiles,
  embed: P.EmbedLinks,
  links: P.EmbedLinks,
  embed_links: P.EmbedLinks,
  react: P.AddReactions,
  reactions: P.AddReactions,
  add_reactions: P.AddReactions,
  emojis: P.UseExternalEmojis,
  external_emojis: P.UseExternalEmojis,
  stickers: P.UseExternalStickers,
  connect: P.Connect,
  join: P.Connect,
  speak: P.Speak,
  stream: P.Stream,
  video: P.Stream,
  camera: P.Stream,
  manage_messages: P.ManageMessages,
  delete_messages: P.ManageMessages,
  pin: P.ManageMessages,
  mention_everyone: P.MentionEveryone,
  everyone: P.MentionEveryone,
  ping_everyone: P.MentionEveryone,
  threads: P.CreatePublicThreads,
  create_threads: P.CreatePublicThreads,
  private_threads: P.CreatePrivateThreads,
  send_in_threads: P.SendMessagesInThreads,
  commands: P.UseApplicationCommands,
  slash_commands: P.UseApplicationCommands,
  manage_channel: P.ManageChannels,
  manage_channels: P.ManageChannels,
  manage_permissions: P.ManageRoles,
  polls: P.SendPolls,
  send_polls: P.SendPolls,
  invite: P.CreateInstantInvite,
  create_invite: P.CreateInstantInvite,
  mute_members: P.MuteMembers,
  deafen_members: P.DeafenMembers,
  move_members: P.MoveMembers,
  priority_speaker: P.PrioritySpeaker,
  tts: P.SendTTSMessages,
  voice_activity: P.UseVAD,
  soundboard: P.UseSoundboard,
  activities: P.UseEmbeddedActivities,
};

function permissionKey(name: string): keyof typeof PermissionFlagsBits | null {
  const n = normalize(name);
  const flag = PERMISSION_NAMES[n];
  const keys = Object.keys(P) as Array<keyof typeof PermissionFlagsBits>;
  if (flag !== undefined) return keys.find((k) => P[k] === flag) ?? null;
  return keys.find((k) => k.toLowerCase() === n.replace(/_/g, "")) ?? null;
}

const VERIFICATION: Record<string, GuildVerificationLevel> = {
  none: GuildVerificationLevel.None,
  off: GuildVerificationLevel.None,
  low: GuildVerificationLevel.Low,
  medium: GuildVerificationLevel.Medium,
  high: GuildVerificationLevel.High,
  highest: GuildVerificationLevel.VeryHigh,
  very_high: GuildVerificationLevel.VeryHigh,
};

const REGIONS: Record<string, string | null> = {
  auto: null,
  automatic: null,
  default: null,
  india: "india",
  mumbai: "india",
  singapore: "singapore",
  japan: "japan",
  tokyo: "japan",
  europe: "rotterdam",
  eu: "rotterdam",
  rotterdam: "rotterdam",
  brazil: "brazil",
  sydney: "sydney",
  australia: "sydney",
  hongkong: "hongkong",
  hong_kong: "hongkong",
  southafrica: "southafrica",
  south_africa: "southafrica",
  russia: "russia",
  us_east: "us-east",
  us_west: "us-west",
  us_central: "us-central",
  us_south: "us-south",
};

/** the latest message a person (not ZARU, not the instruction itself) wrote in a channel */
async function lastHumanMessage(ch: TextChannel | NewsChannel, me: GuildMember, invoker: GuildMember): Promise<Message | null> {
  const recent = await ch.messages.fetch({ limit: 20 });
  return [...recent.values()].find((m) => m.author.id !== me.id && !(m.author.id === invoker.id && /^(\?|zaru\b|<@!?\d{17,20}>)/i.test(m.content))) ?? null;
}

async function run(action: Action, ctx: Ctx): Promise<string> {
  const { client, guild, invoker, created, why, me, origin } = ctx;
  const g = action.args;

  /** a member the asker may act on; voice moves and nickname changes may target the asker too */
  const subject = async (allowSelf = false) => {
    const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member ?? "?"}`);
    if (!(allowSelf && member.id === invoker.id) && !outranks(invoker, member)) fail("they outrank you (or it's you, or the owner)");
    return member;
  };
  /** an image: the url argument, a link in text, or the attachment on the instruction */
  const image = () => (isHttp(g.url) ? g.url : isHttp(g.text) ? g.text : ctx.attachments[0]) ?? fail("attach an image or give me a link to one");
  const save = async (next: GuildSettings) => {
    await persistGuildSettings(client, guild.id, next);
    ctx.settings = next;
  };

  switch (action.type) {
    // ─── channels ─────────────────────────────────────────────────────────────
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
      const community = guild.features.includes("COMMUNITY");
      const type =
        g.kind === "voice" ? ChannelType.GuildVoice : g.kind === "stage" ? ChannelType.GuildStageVoice : g.kind === "forum" && community ? ChannelType.GuildForum : g.kind === "announcement" && community ? ChannelType.GuildAnnouncement : ChannelType.GuildText;
      const voice = type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice;
      const ch = await guild.channels.create({ name, type, parent: category ?? undefined, topic: type === ChannelType.GuildText ? g.topic : undefined, permissionOverwrites: role && role.id !== guild.id ? privateOverwrites(guild, me, role.id, voice) : [], reason: why });
      created.set(plainName(name), ch.id);
      return `created <#${ch.id}>${role && role.id !== guild.id ? `, only <@&${role.id}> can see and ${voice ? "join" : "chat in"} it` : ""}`;
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
    case "delete_channel": {
      if (!g.channel || isHere(g.channel)) fail("tell me which channel; I won't delete the one we're talking in");
      const ch = resolveChannel(guild, g.channel, created) ?? fail(`I can't find a channel called ${g.channel}`);
      if (ch.id === origin.id) fail("not the channel we're talking in");
      const name = ch.name;
      await ch.delete(why);
      return `deleted #${name}`;
    }
    case "clone_channel": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      const copy = await ch.clone({ name: g.name ?? undefined, reason: why });
      if (g.name) created.set(plainName(g.name), copy.id);
      return `created <#${copy.id}> as a copy of <#${ch.id}>`;
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
    case "set_nsfw": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (!("setNSFW" in ch)) fail("that channel can't be age-restricted");
      await ch.setNSFW(g.enabled ?? true, why);
      return `<#${ch.id}> is ${(g.enabled ?? true) ? "now age-restricted" : "no longer age-restricted"}`;
    }
    case "set_user_limit":
    case "set_bitrate":
    case "set_voice_region": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildStageVoice) fail("that isn't a voice channel");
      if (action.type === "set_user_limit") {
        const limit = Math.min(99, g.amount ?? 0);
        await ch.setUserLimit(limit, why);
        return limit ? `<#${ch.id}> takes ${plural(limit, "person")} now` : `<#${ch.id}> has no user limit now`;
      }
      if (action.type === "set_bitrate") {
        const kbps = Math.min(384, Math.max(8, g.amount ?? 64));
        await ch.setBitrate(kbps * 1000, why);
        return `<#${ch.id}> runs at ${kbps} kbps`;
      }
      const key = normalize(g.name ?? "auto");
      const region = key in REGIONS ? REGIONS[key] : key.replace(/_/g, "-");
      await ch.setRTCRegion(region ?? null, why);
      return `<#${ch.id}> voice region is ${region ?? "automatic"}`;
    }
    case "set_channel_position": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      const siblings = ch.parent ? ch.parent.children.cache.size : guild.channels.cache.filter((c) => !c.isThread() && c.parentId === null && c.type !== ChannelType.GuildCategory).size;
      const position = g.name?.toLowerCase() === "bottom" ? Math.max(0, siblings - 1) : g.amount !== undefined ? g.amount : 0;
      await ch.setPosition(position, { reason: why });
      return `<#${ch.id}> is now at the ${position === 0 ? "top" : `position ${position}`}`;
    }
    case "sync_permissions": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (!ch.parent) fail("it isn't inside a category");
      await ch.lockPermissions();
      return `<#${ch.id}> now follows **${ch.parent.name}**`;
    }
    case "lock_channel":
    case "unlock_channel": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: action.type === "lock_channel" ? false : null }, { reason: why });
      return action.type === "lock_channel" ? `<#${ch.id}> is locked` : `<#${ch.id}> is open again`;
    }
    case "restrict_channel":
    case "open_channel": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (action.type === "open_channel") {
        await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null }, { reason: why });
        return `<#${ch.id}> is visible to everyone again`;
      }
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (role.id === guild.id) fail("pick a role other than @everyone");
      const voice = ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice;
      await ch.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, { reason: why });
      await ch.permissionOverwrites.edit(role, voice ? { ViewChannel: true, Connect: true } : { ViewChannel: true, SendMessages: true }, { reason: why });
      await ch.permissionOverwrites.edit(me, voice ? { ViewChannel: true, Connect: true } : { ViewChannel: true, SendMessages: true }, { reason: why }).catch(() => undefined);
      const others = ch.permissionOverwrites.cache
        .filter((o) => o.type === OverwriteType.Role && o.id !== role.id && o.id !== guild.id && o.allow.has(P.ViewChannel))
        .map((o) => `<@&${o.id}>`);
      const kind = ch.type === ChannelType.GuildCategory ? "category" : "channel";
      return `only <@&${role.id}> can see and ${voice ? "join" : "chat in"} the ${kind} <#${ch.id}> now${others.length ? `; ${others.join(", ")} keep their own access` : ""}`;
    }
    case "set_permission": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      const key = permissionKey(g.permission ?? "") ?? fail(`I don't know a permission called ${g.permission ?? "?"}`);
      const who = g.role ? (resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role}`)) : g.member ? ((await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member}`)) : fail("for which role or member?");
      if (invoker.id !== guild.ownerId && !invoker.permissionsIn(ch).has(P.Administrator) && !invoker.permissionsIn(ch).has(P[key])) fail(`you don't have ${key} there yourself`);
      if (who instanceof Role && who.id !== guild.id && !roleWithinReach(invoker, who)) fail("that role is above you or me");
      const options = { [key]: g.enabled ?? null } as PermissionOverwriteOptions;
      await ch.permissionOverwrites.edit(who, options, { reason: why });
      const label = who instanceof Role ? (who.id === guild.id ? "@everyone" : `<@&${who.id}>`) : `<@${who.id}>`;
      return `${key} is ${g.enabled === undefined ? "back to default" : g.enabled ? "allowed" : "denied"} for ${label} in <#${ch.id}>`;
    }
    case "gate_server": {
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (role.id === guild.id) fail("pick a role other than @everyone");
      const tops = [...guild.channels.cache.values()].filter((c) => !c.isThread() && (c.type === ChannelType.GuildCategory || c.parentId === null)).slice(0, 100);
      let done = 0;
      const failed: string[] = [];
      for (const c of tops) {
        if (c.isThread()) continue;
        const ok = await c.permissionOverwrites
          .edit(guild.roles.everyone, { ViewChannel: false }, { reason: why })
          .then(() => c.permissionOverwrites.edit(role, { ViewChannel: true }, { reason: why }))
          .then(() => true, () => false);
        if (ok) done++;
        else failed.push(c.name);
      }
      const unsynced = guild.channels.cache.filter((c) => !c.isThread() && c.parentId !== null && c.permissionsLocked === false).size;
      return `hidden from @everyone and opened to <@&${role.id}> on ${plural(done, "category/channel")}${failed.length ? ` (couldn't touch ${failed.slice(0, 5).join(", ")})` : ""}${unsynced ? `; ${plural(unsynced, "channel")} inside categories keep their own permissions` : ""}`;
    }
    case "create_thread": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      if (ch.type !== ChannelType.GuildText) fail("threads like this only work in text channels");
      const name = (g.name ?? (g.text ?? "").slice(0, 60)).trim();
      if (!name) fail("what should the thread be called?");
      const thread = await ch.threads.create({ name, autoArchiveDuration: ThreadAutoArchiveDuration.OneDay, reason: why });
      if (g.text) await thread.send({ content: g.text, allowedMentions: { parse: [] } }).catch(() => undefined);
      return `started <#${thread.id}>`;
    }

    // ─── roles ────────────────────────────────────────────────────────────────
    case "create_role": {
      const name = g.name ?? fail("no name given");
      const role = await guild.roles.create({ name, color: parseColor(g.color), hoist: g.hoist ?? false, mentionable: g.mentionable ?? false, reason: why });
      created.set(`role:${plainName(name)}`, role.id);
      return `created <@&${role.id}>`;
    }
    case "edit_role": {
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (!roleWithinReach(invoker, role)) fail("that role is above you or me, or belongs to an integration");
      await role.edit({ name: g.name, color: parseColor(g.color), hoist: g.hoist, mentionable: g.mentionable, reason: why });
      if (g.name) created.set(`role:${plainName(g.name)}`, role.id);
      return `<@&${role.id}> updated`;
    }
    case "delete_role": {
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (!roleWithinReach(invoker, role)) fail("that role is above you or me, or belongs to an integration");
      const name = role.name;
      await role.delete(why);
      return `deleted role ${name}`;
    }
    case "move_role": {
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      const other = resolveRole(guild, g.other, created) ?? fail(`I can't find a role called ${g.other ?? "?"}`);
      if (role.id === other.id) fail("that's the same role twice");
      if (!roleWithinReach(invoker, role)) fail("that role is above you or me, or belongs to an integration");
      const below = g.kind === "below";
      const movingUp = role.position < other.position;
      // the sorted list loses the moved role before it is re-inserted, so the index shifts by one when moving up
      const index = movingUp ? (below ? other.position - 1 : other.position) : below ? other.position : other.position + 1;
      if (index >= me.roles.highest.position || (invoker.id !== guild.ownerId && index >= invoker.roles.highest.position)) fail("that would put it above me or above your own top role");
      await role.setPosition(Math.max(1, index), { reason: why });
      return `<@&${role.id}> now sits ${below ? "below" : "above"} <@&${other.id}>`;
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
    case "give_role_all":
    case "remove_role_all": {
      const role = resolveRole(guild, g.role, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`);
      if (!roleWithinReach(invoker, role)) fail("that role is above you or me, or belongs to an integration");
      const give = action.type === "give_role_all";
      const all = await guild.members.fetch();
      const targets = [...all.values()].filter((m) => !m.user.bot && (give ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id))).slice(0, 500);
      let done = 0;
      for (const m of targets) {
        const ok = await (give ? m.roles.add(role, why) : m.roles.remove(role, why)).then(() => true, () => false);
        if (ok) done++;
      }
      return `${give ? "gave" : "took"} <@&${role.id}> ${give ? "to" : "from"} ${plural(done, "member")}${targets.length === 500 ? " (the first 500)" : ""}`;
    }

    // ─── members ──────────────────────────────────────────────────────────────
    case "set_nickname": {
      const member = await subject(true);
      if (!member.manageable) fail("their top role is above mine");
      await member.setNickname(g.name ?? null, why);
      return `<@${member.id}> is now called **${g.name ?? member.user.username}**`;
    }
    case "warn": {
      const member = await subject();
      const reason = g.reason ?? `asked by ${invoker.user.tag}`;
      const modCase = await createCase(client.db, { guildId: guild.id, type: "warn", targetId: member.id, moderatorId: invoker.id, reason });
      await sendModLog(guild, ctx.settings, { title: "Member warned", caseNumber: modCase.caseNumber, action: "warn", target: member.user, moderator: invoker.user, reason, color: 0xf0c24b });
      await member.user
        .send({ embeds: [knoxEmbed(ctx.settings.embedColor).setTitle(`Warned in ${guild.name}`).setDescription(reason).setFooter({ text: `Case #${modCase.caseNumber}` })] })
        .catch(() => undefined);
      const escalation = await applyWarnEscalation(client, guild, member, ctx.settings);
      return `warned <@${member.id}> · case #${modCase.caseNumber}${escalation ? ` ${escalation}` : ""}`;
    }
    case "kick":
    case "ban":
    case "timeout":
    case "untimeout": {
      const member = await subject();
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
      const minutes = g.minutes || 10;
      await notifyTarget(member.user, guild, "timed out", reason, minutes * 60_000);
      await member.timeout(minutes * 60_000, `${reason} (${why})`);
      return `<@${member.id}> timed out for ${minutes} min`;
    }
    case "unban": {
      const ref = g.member ?? fail("who should I unban?");
      const bans = await guild.bans.fetch();
      const want = plainName(ref.replace(/^@/, ""));
      const id = idFrom(ref);
      const hit = bans.find((b) => b.user.id === id || plainName(b.user.username) === want || plainName(b.user.tag) === want || plainName(b.user.globalName ?? "") === want);
      if (!hit) fail(`nobody on the ban list matches ${ref}`);
      await guild.bans.remove(hit.user, `${g.reason ?? "unbanned"} (${why})`);
      return `unbanned ${hit.user.tag}`;
    }
    case "voice_mute":
    case "voice_deafen":
    case "voice_disconnect":
    case "voice_move": {
      const member = await subject(action.type === "voice_move" || action.type === "voice_disconnect");
      if (!member.voice.channel) fail("they're not in a voice channel");
      if (action.type === "voice_mute") {
        await member.voice.setMute(g.enabled ?? true, why);
        return `<@${member.id}> is ${(g.enabled ?? true) ? "muted" : "unmuted"} in voice`;
      }
      if (action.type === "voice_deafen") {
        await member.voice.setDeaf(g.enabled ?? true, why);
        return `<@${member.id}> is ${(g.enabled ?? true) ? "deafened" : "undeafened"}`;
      }
      if (action.type === "voice_disconnect") {
        await member.voice.disconnect(why);
        return `<@${member.id}> was disconnected from voice`;
      }
      const vc = resolveChannel(guild, g.channel, created, VOICEISH) ?? fail(`I can't find a voice channel called ${g.channel ?? "?"}`);
      if (!vc.isVoiceBased()) fail("that isn't a voice channel");
      await member.voice.setChannel(vc, why);
      return `moved <@${member.id}> to <#${vc.id}>`;
    }
    case "dm_member": {
      const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member ?? "?"}`);
      const text = g.text ?? fail("what should I tell them?");
      if (member.user.bot) fail("that's a bot");
      const sent = await member
        .send({ embeds: [knoxEmbed(ctx.settings.embedColor).setAuthor({ name: `Message from the staff of ${guild.name}` }).setDescription(text)] })
        .then(() => true, () => false);
      if (!sent) fail("their DMs are closed");
      return `sent a DM to <@${member.id}>`;
    }
    case "give_coins":
    case "take_coins":
    case "give_xp": {
      const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member ?? "?"}`);
      const amount = g.amount || fail("how many?");
      if (action.type === "give_coins") {
        const wallet = await addWallet(client.db, guild.id, member.id, amount);
        return `<@${member.id}> now has ${wallet} coins`;
      }
      if (action.type === "take_coins") {
        const ok = await takeWallet(client.db, guild.id, member.id, amount);
        if (!ok) fail("they don't have that much");
        return `took ${amount} coins from <@${member.id}>`;
      }
      const result = await addXp(client.db, guild.id, member.id, amount, 0);
      return `<@${member.id}> now has ${result.xp} XP (level ${result.level})${result.leveled ? " · level up!" : ""}`;
    }

    // ─── messages ─────────────────────────────────────────────────────────────
    case "purge": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const amount = Math.min(100, g.amount || 10);
      if (g.member) {
        const member = (await resolveMember(guild, g.member)) ?? fail(`I can't find a member called ${g.member}`);
        const recent = await ch.messages.fetch({ limit: 100 });
        const theirs = [...recent.values()].filter((m) => m.author.id === member.id).slice(0, amount);
        const deleted = await ch.bulkDelete(theirs, true);
        return `deleted ${deleted.size} of <@${member.id}>'s messages in <#${ch.id}>`;
      }
      const deleted = await ch.bulkDelete(amount, true);
      return `deleted ${plural(deleted.size, "message")} in <#${ch.id}>`;
    }
    case "pin_last": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const recent = await ch.messages.fetch({ limit: 20 });
      const picks = [...recent.values()]
        .filter((m) => !m.pinned && m.author.id !== me.id && !(m.author.id === invoker.id && /^(\?|zaru\b|<@!?\d{17,20}>)/i.test(m.content)))
        .slice(0, Math.min(5, g.amount || 1));
      if (!picks.length) fail("there's nothing to pin");
      for (const m of picks) await m.pin(why);
      return `pinned ${plural(picks.length, "message")} in <#${ch.id}>`;
    }
    case "edit_last": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const text = g.text ?? fail("what should it say now?");
      const recent = await ch.messages.fetch({ limit: 50 });
      const mine = [...recent.values()].find((m) => m.author.id === me.id && m.interaction === null && !m.reference) ?? fail("I have no recent message there");
      const first = mine.embeds[0];
      if (first && !mine.content) await mine.edit({ embeds: [EmbedBuilder.from(first).setDescription(text)] });
      else await mine.edit({ content: text, allowedMentions: { parse: [] } });
      return `edited ${mine.url}`;
    }
    case "react_last": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const message = (await lastHumanMessage(ch, me, invoker)) ?? fail("there's no message to react to");
      const wanted = (g.text ?? "👍").trim();
      const custom = guild.emojis.cache.find((e) => e.name !== null && (plainName(e.name) === plainName(wanted.replace(/:/g, "")) || `<${e.animated ? "a" : ""}:${e.name}:${e.id}>` === wanted));
      await message.react(custom ?? wanted);
      return `reacted ${custom ? `:${custom.name}:` : wanted} to ${message.url}`;
    }
    case "send_message": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const text = g.text ?? (ctx.attachments.length ? "" : fail("nothing to say"));
      const everyone = invoker.permissions.has(P.MentionEveryone);
      const files: string[] = g.url && isHttp(g.url) ? [g.url] : ctx.attachments.slice(0, 5);
      await ch.send({ content: text || undefined, files, allowedMentions: { parse: everyone ? ["users", "roles", "everyone"] : ["users", "roles"] } });
      return `posted in <#${ch.id}>`;
    }
    case "send_embed": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      if (!g.name && !g.text) fail("nothing to post");
      const embed = knoxEmbed(ctx.settings.embedColor);
      if (g.name) embed.setTitle(g.name.slice(0, 256));
      if (g.text) embed.setDescription(g.text);
      const picture = isHttp(g.url) ? g.url : ctx.attachments[0];
      if (picture) embed.setImage(picture);
      await ch.send({ embeds: [embed] });
      return `posted in <#${ch.id}>`;
    }
    case "send_poll": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const question = (g.name ?? g.topic ?? fail("what's the question?")).slice(0, 300);
      const options = (g.text ?? "")
        .split(/\s*(?:\||\n|;)\s*|\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      const answers = options.length >= 2 ? options : ["Yes", "No"];
      const hours = Math.min(768, Math.max(1, Math.round((g.minutes || 1440) / 60)));
      await ch.send({ poll: { question: { text: question }, answers: answers.map((text) => ({ text: text.slice(0, 55) })), duration: hours, allowMultiselect: false } });
      return `poll is up in <#${ch.id}> (${answers.length} options, ${hours} h)`;
    }
    case "create_invite": {
      const ch = guildChannel(guild, target(g.channel, origin), created);
      if (!("createInvite" in ch)) fail("pick a channel, not a category");
      const maxAge = Math.min(7 * 86_400, (g.minutes ?? 1440) * 60);
      const invite = await ch.createInvite({ maxAge, maxUses: g.amount ?? 0, unique: true, reason: why });
      return `${invite.url} (${maxAge ? `expires in ${Math.round(maxAge / 60)} min` : "never expires"}${g.amount ? `, ${plural(g.amount, "use")}` : ""})`;
    }
    case "create_event": {
      const name = g.name ?? fail("what's the event called?");
      const start = g.when ? new Date(g.when) : null;
      if (!start || Number.isNaN(start.getTime())) fail("tell me when, with a date and time");
      if (start.getTime() < Date.now() + 60_000) fail("that time is already past");
      const end = new Date(start.getTime() + (g.minutes || 120) * 60_000);
      const vc = g.channel && !isHere(g.channel) ? resolveChannel(guild, g.channel, created, VOICEISH) : null;
      const event =
        vc && vc.isVoiceBased()
          ? await guild.scheduledEvents.create({
              name,
              scheduledStartTime: start,
              scheduledEndTime: end,
              privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
              entityType: vc.type === ChannelType.GuildStageVoice ? GuildScheduledEventEntityType.StageInstance : GuildScheduledEventEntityType.Voice,
              channel: vc.id,
              description: g.text?.slice(0, 1000),
              reason: why,
            })
          : await guild.scheduledEvents.create({
              name,
              scheduledStartTime: start,
              scheduledEndTime: end,
              privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
              entityType: GuildScheduledEventEntityType.External,
              entityMetadata: { location: (g.topic ?? "Discord").slice(0, 100) },
              description: g.text?.slice(0, 1000),
              reason: why,
            });
      return `**${event.name}** is on the calendar for ${stamp(start)} ${event.url}`;
    }
    case "schedule_message": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const content = g.text ?? fail("what should it post?");
      const repeat: Repeat = (REPEATS as readonly string[]).includes(g.kind ?? "") ? (g.kind as Repeat) : "daily";
      const at = g.when ? new Date(g.when) : null;
      if ((repeat === "daily" || repeat === "weekly") && (!at || Number.isNaN(at.getTime()))) fail("tell me the time of day (and the weekday for weekly)");
      const atUtc = at && !Number.isNaN(at.getTime()) ? `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")}` : null;
      const rule = { repeat, atUtc, weekday: repeat === "weekly" && at ? at.getUTCDay() : null };
      const first = nextRun(rule, new Date());
      const [row] = await client.db.insert(scheduledPosts).values({ guildId: guild.id, channelId: ch.id, content, repeat, atUtc: rule.atUtc, weekday: rule.weekday, nextRunAt: first, createdBy: invoker.id }).returning();
      return `scheduled post #${row?.id ?? "?"}: ${describeRule(rule)} → <#${ch.id}>, first ${stamp(first)}`;
    }
    case "remind": {
      const text = g.text ?? fail("remind you of what?");
      const at = g.when ? new Date(g.when) : null;
      const fireAt = at && !Number.isNaN(at.getTime()) && at.getTime() > Date.now() ? at : new Date(Date.now() + (g.minutes || 30) * 60_000);
      await client.db.insert(reminders).values({ guildId: guild.id, userId: invoker.id, channelId: origin.id, text, fireAt });
      return `I'll remind you ${stamp(fireAt, "R")}`;
    }
    case "start_giveaway": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const prize = g.text ?? g.name ?? fail("what's the prize?");
      const minutes = g.minutes || 60;
      const winnerCount = Math.min(20, Math.max(1, g.amount || 1));
      const endsAt = new Date(Date.now() + minutes * 60_000);
      const message = await ch.send({
        embeds: [knoxEmbed(ctx.settings.embedColor).setTitle("Giveaway").setDescription(`**${prize}**\nWinners: **${winnerCount}**\nEnds ${stamp(endsAt, "R")}`).setFooter({ text: "Click Join to enter" })],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(GIVEAWAY_JOIN_ID).setLabel("Join").setStyle(ButtonStyle.Success))],
      });
      await client.db.insert(giveaways).values({ guildId: guild.id, channelId: ch.id, messageId: message.id, prize, winnerCount, hostId: invoker.id, endsAt, entries: [] });
      return `giveaway for **${prize}** is live in <#${ch.id}>, ends ${stamp(endsAt, "R")}`;
    }
    case "set_sticky": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const content = g.text ?? fail("what should the sticky note say?");
      const previous = client.stickies.get(ch.id);
      await client.db
        .insert(stickyMessages)
        .values({ channelId: ch.id, guildId: guild.id, content, createdBy: invoker.id })
        .onConflictDoUpdate({ target: stickyMessages.channelId, set: { content, createdBy: invoker.id } });
      await repostSticky(client, ch, { guildId: guild.id, content, lastMessageId: previous?.lastMessageId ?? null });
      return `sticky note set in <#${ch.id}>`;
    }
    case "remove_sticky": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const entry = client.stickies.get(ch.id) ?? fail(`<#${ch.id}> has no sticky note`);
      const timer = client.stickyTimers.get(ch.id);
      if (timer) clearTimeout(timer);
      client.stickyTimers.delete(ch.id);
      client.stickies.delete(ch.id);
      await client.db.delete(stickyMessages).where(eq(stickyMessages.channelId, ch.id));
      if (entry.lastMessageId) await ch.messages.delete(entry.lastMessageId).catch(() => undefined);
      return `sticky note removed from <#${ch.id}>`;
    }
    case "ticket_panel": {
      const ch = textChannel(guild, target(g.channel, origin), created);
      const topics = ctx.settings.features.ticketTopics;
      if (!topics.length) fail("no ticket topics yet: /ticket topics add, or /setup auto installs the defaults");
      await ch.send({
        embeds: [knoxEmbed(ctx.settings.embedColor).setTitle("Need help?").setDescription("Pick what your ticket is about and tell us a little; a private channel with staff opens for you.")],
        components: panelComponents(topics),
      });
      return `ticket panel posted in <#${ch.id}>`;
    }
    case "create_tag":
    case "delete_tag": {
      const name = (g.name ?? "").toLowerCase().replace(/\s+/g, "-").slice(0, 32);
      if (!name) fail("what's the tag called?");
      if (action.type === "delete_tag") {
        const gone = await client.db.delete(customTags).where(and(eq(customTags.guildId, guild.id), eq(customTags.name, name))).returning({ name: customTags.name });
        if (!gone.length) fail(`there's no tag called ${name}`);
        return `tag \`${name}\` deleted`;
      }
      const content = g.text ?? fail("what should the tag say?");
      await client.db
        .insert(customTags)
        .values({ guildId: guild.id, name, content: content.slice(0, 1800), authorId: invoker.id })
        .onConflictDoUpdate({ target: [customTags.guildId, customTags.name], set: { content: content.slice(0, 1800), authorId: invoker.id } });
      return `tag \`${name}\` saved; ?${name} or /tag show posts it`;
    }
    case "add_auto_response":
    case "remove_auto_response": {
      const trigger = normalizeTrigger(g.text ?? fail("which words should trigger it?"));
      if (!trigger) fail("which words should trigger it?");
      if (action.type === "remove_auto_response") {
        const gone = await client.db.delete(autoResponses).where(and(eq(autoResponses.guildId, guild.id), eq(autoResponses.trigger, trigger))).returning({ trigger: autoResponses.trigger });
        if (!gone.length) fail(`there's no auto-reply for "${trigger}"`);
        await reloadGuildAutoResponses(client, guild.id);
        return `auto-reply for "${trigger}" removed`;
      }
      const reply = g.topic ?? g.other ?? fail("what should ZARU reply?");
      const match = g.kind === "exact" || g.kind === "starts" ? g.kind : "contains";
      await client.db
        .insert(autoResponses)
        .values({ guildId: guild.id, trigger, reply: reply.slice(0, 1800), match, createdBy: invoker.id })
        .onConflictDoUpdate({ target: [autoResponses.guildId, autoResponses.trigger], set: { reply: reply.slice(0, 1800), match, createdBy: invoker.id } });
      await reloadGuildAutoResponses(client, guild.id);
      return `when a message ${match === "exact" ? "is exactly" : match === "starts" ? "starts with" : "contains"} "${trigger}", ZARU replies`;
    }
    case "add_feed": {
      const kinds = Object.keys(KIND_LABEL) as FeedKind[];
      const kind = kinds.find((k) => k === (g.kind ?? "").toLowerCase()) ?? fail(`feed kinds are ${kinds.join(", ")}`);
      const input = g.text ?? g.url ?? fail("which channel, account or feed URL?");
      const ch = textChannel(guild, target(g.channel, origin), created);
      const role = g.role ? resolveRole(guild, g.role, created) : null;
      const [existing] = await client.db.select({ n: count() }).from(feedSubscriptions).where(eq(feedSubscriptions.guildId, guild.id));
      if ((existing?.n ?? 0) >= MAX_FEEDS) fail(`this server already follows ${MAX_FEEDS} feeds; remove one first`);
      const resolved = await resolveSource(kind, input);
      const [row] = await client.db
        .insert(feedSubscriptions)
        .values({ guildId: guild.id, channelId: ch.id, kind, source: resolved.source, label: resolved.label, pingRoleId: role && role.id !== guild.id ? role.id : null, template: null, seenIds: resolved.seen, createdBy: invoker.id })
        .onConflictDoNothing()
        .returning();
      if (!row) fail(`<#${ch.id}> already gets ${KIND_LABEL[kind]} alerts for ${resolved.label}`);
      return `${KIND_LABEL[kind]} alerts for **${resolved.label}** go to <#${ch.id}>${role && role.id !== guild.id ? `, pinging <@&${role.id}>` : ""}`;
    }
    case "remove_feed": {
      const want = plainName(g.text ?? g.url ?? g.name ?? fail("which feed?"));
      const rows = await client.db.select().from(feedSubscriptions).where(eq(feedSubscriptions.guildId, guild.id));
      const hits = rows.filter((r) => plainName(r.label) === want || r.source.toLowerCase() === want || plainName(r.label).includes(want));
      if (!hits.length) fail("no feed matches that");
      if (hits.length > 1 && !g.channel) fail(`${hits.length} feeds match: ${hits.map((h) => `${h.label} in <#${h.channelId}>`).join(", ")}; say which channel`);
      const pick = hits.length === 1 ? hits[0]! : hits.find((h) => h.channelId === textChannel(guild, target(g.channel, origin), created).id) ?? fail("no feed like that in that channel");
      await client.db.delete(feedSubscriptions).where(eq(feedSubscriptions.id, pick.id));
      return `stopped ${KIND_LABEL[pick.kind]} alerts for **${pick.label}** in <#${pick.channelId}>`;
    }

    // ─── server and ZARU itself ───────────────────────────────────────────────
    case "set_server_name": {
      const name = g.name ?? fail("what should the server be called?");
      await guild.setName(name, why);
      return `the server is now called **${name}**`;
    }
    case "set_server_icon": {
      await guild.setIcon(image(), why);
      return "server icon changed";
    }
    case "set_server_channel": {
      const which = normalize(g.name ?? "");
      if (which === "afk") {
        const ch = guildChannel(guild, g.channel, created);
        if (ch.type !== ChannelType.GuildVoice) fail("the AFK channel must be a voice channel");
        await guild.setAFKChannel(ch, why);
        return `AFK channel is <#${ch.id}>`;
      }
      const ch = textChannel(guild, target(g.channel, origin), created);
      if (which === "system" || which === "system_messages") await guild.setSystemChannel(ch.id, why);
      else if (which === "rules") await guild.setRulesChannel(ch.id, why);
      else if (which === "updates" || which === "public_updates" || which === "moderator_updates") await guild.setPublicUpdatesChannel(ch.id, why);
      else fail("server channels are afk, system, rules or updates");
      return `the server's ${which} channel is <#${ch.id}>`;
    }
    case "set_notifications": {
      const which = normalize(g.name ?? "");
      const level = which === "all" || which === "all_messages" ? GuildDefaultMessageNotifications.AllMessages : which === "mentions" || which === "only_mentions" ? GuildDefaultMessageNotifications.OnlyMentions : fail("notifications are all or mentions");
      await guild.setDefaultMessageNotifications(level, why);
      return `default notifications: ${which === "all" || which === "all_messages" ? "all messages" : "only @mentions"}`;
    }
    case "set_content_filter": {
      const which = normalize(g.name ?? "");
      const level =
        which === "off" || which === "none" || which === "disabled"
          ? GuildExplicitContentFilter.Disabled
          : which === "no_role" || which === "members_without_roles" || which === "new"
            ? GuildExplicitContentFilter.MembersWithoutRoles
            : which === "all" || which === "everyone" || which === "all_members"
              ? GuildExplicitContentFilter.AllMembers
              : fail("filter levels are off, no_role or all");
      await guild.setExplicitContentFilter(level, why);
      return `explicit media filter: ${GuildExplicitContentFilter[level]}`;
    }
    case "set_verification": {
      const level = VERIFICATION[normalize(g.name ?? "")];
      if (level === undefined) fail("levels are none, low, medium, high or highest");
      await guild.setVerificationLevel(level, why);
      return `verification level is **${GuildVerificationLevel[level]}**`;
    }
    case "create_emoji": {
      const name = (g.name ?? "").replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 32).padEnd(2, "_");
      if (!g.name) fail("what should the emoji be called?");
      const emoji = await guild.emojis.create({ attachment: image(), name, reason: why });
      return `added ${emoji.toString()} (:${emoji.name}:)`;
    }
    case "delete_emoji": {
      const want = plainName((g.name ?? "").replace(/:/g, ""));
      const emoji = guild.emojis.cache.find((e) => e.name !== null && plainName(e.name) === want) ?? fail(`there's no emoji called ${g.name ?? "?"}`);
      const label = emoji.name;
      await emoji.delete(why);
      return `deleted :${label}:`;
    }
    case "lockdown_server":
    case "end_lockdown": {
      const result = await lockdownGuild(client, guild, action.type === "lockdown_server" ? "on" : "off", g.reason ?? null, invoker.user.tag);
      if (!result.ok) fail(result.error);
      return result.message;
    }
    case "raid_mode": {
      const on = g.enabled ?? true;
      const ok = on ? await enableRaidMode(client, guild, g.minutes || 30, why) : await disableRaidMode(client, guild, why);
      if (!ok) fail(on ? "raid mode is already on" : "raid mode wasn't on");
      return on ? `raid mode is on for ${g.minutes || 30} min` : "raid mode is off";
    }
    case "prune_inactive": {
      const days = Math.min(30, Math.max(1, g.amount || 30));
      const pruned = await guild.members.prune({ days, reason: why });
      return `removed ${plural(pruned ?? 0, "member")} inactive for ${days} days with no role`;
    }
    case "block_words":
    case "unblock_words": {
      const typed = (g.text ?? "").split(/[,\n]+/).map((w) => w.trim()).filter(Boolean);
      const current = normalizeWords(ctx.settings.moderation.blockedWords);
      const block = action.type === "block_words";
      const next = block ? (/^default$/i.test(g.text ?? "") ? normalizeWords([...current, ...HINGLISH_ABUSE]) : normalizeWords([...current, ...typed])) : /^(all|everything)$/i.test(g.text ?? "") ? [] : current.filter((w) => !normalizeWords(typed).includes(w));
      if (block && !typed.length) fail("which words?");
      await save({ ...ctx.settings, moderation: { ...ctx.settings.moderation, blockedWords: next } });
      const rows = await client.guildConfig.get(guild.id);
      const outcome = await syncBlockedWordsRule(guild, ctx.settings, rows.permissionRows, invoker.user.tag).catch((err) => `saved, but Discord refused the rule: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`);
      return `${next.length} blocked words now. ${outcome}`;
    }
    case "configure": {
      const name = g.name ?? fail("which setting?");
      const def = SETTINGS[normalize(name)] ?? fail(`I don't know a setting called ${name}. I know: ${Object.keys(SETTINGS).join(", ")}`);
      let value: string | null;
      if (g.enabled === false) value = null;
      else if (def.kind === "role") value = (resolveRole(guild, g.role ?? g.other, created) ?? fail(`I can't find a role called ${g.role ?? "?"}`)).id;
      else if (def.kind === "category") value = (resolveCategory(guild, g.category ?? g.channel, created) ?? fail(`I can't find a category called ${g.category ?? g.channel ?? "?"}`)).id;
      else {
        const ch = guildChannel(guild, target(g.channel ?? g.category, origin), created);
        if (def.kind === "text" && !TEXTISH.includes(ch.type)) fail("that needs a text channel");
        if (def.kind === "voice" && !VOICEISH.includes(ch.type)) fail("that needs a voice channel");
        if (ch.type === ChannelType.GuildCategory) fail("that needs a channel, not a category");
        value = ch.id;
      }
      await save(applySetting(ctx.settings, name, value) ?? fail(`I can't change ${name}`));
      return value ? `ZARU's ${def.label} is now ${def.kind === "role" ? `<@&${value}>` : `<#${value}>`}` : `ZARU's ${def.label} is off`;
    }
    case "set_feature": {
      const name = g.name ?? fail("which switch?");
      const on = g.enabled ?? true;
      if (normalize(name) === "raid_mode") return run({ type: "raid_mode", args: { enabled: on, minutes: g.minutes } }, ctx);
      await save(applyToggle(ctx.settings, name, on) ?? fail(`I don't know a switch called ${name}. I know: ${Object.keys(TOGGLES).filter((k) => !k.startsWith("module_")).join(", ")}`));
      const note = normalize(name) === "ai_moderation" && on && !aiProvider() ? " (no AI key on my host yet, so it can't run)" : "";
      return `${settingLabel(name)} is ${on ? "on" : "off"}${note}`;
    }
    case "set_text": {
      const name = g.name ?? fail("which text? welcome_message, goodbye_message, welcome_dm or embed_color");
      const next = applyText(ctx.settings, name, g.text ?? g.topic ?? null);
      if (next === null) fail(`I don't know a text called ${name}; I know welcome_message, goodbye_message, welcome_dm and embed_color`);
      if (typeof next === "string") fail(next);
      await save(next);
      return `${settingLabel(name)} updated`;
    }
    default:
      return fail("I don't know how to do that");
  }
}
