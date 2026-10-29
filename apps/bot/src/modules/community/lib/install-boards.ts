// Posts the rules, the announcement, the role menus, and a one-line purpose in each public channel.
// Messages are sent as the bot. Safe to run again: a channel that already has this board title is left alone.
import { BOARD_FOOTER, CHANNEL_ABOUT, ROLE_MENUS, ROLES_CHANNEL_NAME, announcementText, menuMaxValues, rolesIntroText, rulesText, type RoleMenuSpec, type SelfRoleSpec } from "./join-roles.js";

const API = "https://discord.com/api/v10";
const EMBED_COLOR = 0xe8ff47;
const SEND_AND_CONNECT = (1n << 11n) | (1n << 20n);
const VIEW_AND_SEND = (1n << 10n) | (1n << 11n);
const BLOCKED_ROLE_PERMS = [
  1n << 1n, // kick
  1n << 2n, // ban
  1n << 3n, // administrator
  1n << 4n, // manage channels
  1n << 5n, // manage server
  1n << 13n, // manage messages
  1n << 17n, // mention everyone
  1n << 27n, // manage nicknames
  1n << 28n, // manage roles
  1n << 29n, // manage webhooks
  1n << 34n, // manage threads
  1n << 40n, // timeout
];

type ApiRole = { id: string; name: string; managed: boolean; position: number; permissions: string };
type ApiChannel = { id: string; name: string; type: number; parent_id: string | null; topic: string | null };
type ApiMessage = { author: { id: string }; embeds: Array<{ title?: string | null; footer?: { text?: string | null } | null }> };

export type InstallResult = { lines: string[] };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discord<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": "ZARU (boards, 1.0)",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({ retry_after: 1 }))) as { retry_after?: number };
      await sleep(Math.ceil((data.retry_after ?? 1) * 1000) + 200);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} failed (${res.status}): ${text.slice(0, 280)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
  throw new Error(`${method} ${path} stayed rate limited`);
}

function grantable(role: ApiRole, botTop: number): boolean {
  if (role.managed || role.position >= botTop) return false;
  const bits = BigInt(role.permissions);
  return !BLOCKED_ROLE_PERMS.some((flag) => (bits & flag) === flag);
}

function namesFor(spec: SelfRoleSpec): string[] {
  return [spec.name, ...(spec.reuseNames ?? [])].map((name) => name.toLowerCase());
}

function findRole(roles: ApiRole[], spec: SelfRoleSpec): ApiRole | undefined {
  const wanted = new Set(namesFor(spec));
  return roles.find((role) => wanted.has(role.name.toLowerCase()));
}

function boardEmbed(title: string, description: string) {
  return { title, description, color: EMBED_COLOR, footer: { text: BOARD_FOOTER } };
}

function alreadyPosted(messages: ApiMessage[], botId: string, title: string): boolean {
  return messages.some(
    (message) => message.author.id === botId && message.embeds.some((embed) => embed.footer?.text === BOARD_FOOTER && embed.title === title),
  );
}

async function ensureRole(token: string, guildId: string, roles: ApiRole[], spec: SelfRoleSpec, botTop: number, lines: string[]): Promise<ApiRole | null> {
  const existing = findRole(roles, spec);
  if (existing) {
    if (!grantable(existing, botTop)) {
      lines.push(`Skipped ${existing.name}: ZARU can't hand that role out.`);
      return null;
    }
    return existing;
  }
  const created = await discord<ApiRole>(token, "POST", `/guilds/${guildId}/roles`, {
    name: spec.name,
    color: spec.color,
    hoist: false,
    mentionable: spec.mentionable ?? false,
    permissions: "0",
  });
  roles.push(created);
  lines.push(`Created role ${created.name}.`);
  await sleep(400);
  return created;
}

function menuPayload(menu: RoleMenuSpec, options: Array<{ label: string; value: string; description: string }>) {
  return {
    embeds: [boardEmbed(menu.title, menu.description)],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "knox:rolemenu",
            placeholder: menu.placeholder.slice(0, 150),
            min_values: 0,
            max_values: Math.min(menuMaxValues(menu), options.length),
            options: options.map((option) => ({
              label: option.label.slice(0, 100),
              value: option.value,
              description: option.description.slice(0, 100),
            })),
          },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export async function installServerBoards(token: string, guildId: string): Promise<InstallResult> {
  const lines: string[] = [];
  const me = await discord<{ id: string }>(token, "GET", "/users/@me");
  const guild = await discord<{ name: string }>(token, "GET", `/guilds/${guildId}`);
  const roles = await discord<ApiRole[]>(token, "GET", `/guilds/${guildId}/roles`);
  const channels = await discord<ApiChannel[]>(token, "GET", `/guilds/${guildId}/channels`);
  const member = await discord<{ roles: string[] }>(token, "GET", `/guilds/${guildId}/members/${me.id}`);
  const botTop = Math.max(0, ...roles.filter((role) => member.roles.includes(role.id)).map((role) => role.position));

  const rulesChannel = channels.find((channel) => channel.name === "rules" && channel.type === 0);
  const infoCategoryId = rulesChannel?.parent_id ?? channels.find((channel) => channel.type === 4 && channel.name.toLowerCase().includes("info"))?.id ?? null;

  let rolesChannel = channels.find((channel) => channel.name === ROLES_CHANNEL_NAME && (channel.type === 0 || channel.type === 5));
  if (!rolesChannel) {
    rolesChannel = await discord<ApiChannel>(token, "POST", `/guilds/${guildId}/channels`, {
      name: ROLES_CHANNEL_NAME,
      type: 0,
      parent_id: infoCategoryId,
      position: 1,
      topic: "Pick Male or Female, 18+ or 18-, and your games.",
      permission_overwrites: [
        { id: guildId, type: 0, allow: "0", deny: SEND_AND_CONNECT.toString() },
        { id: me.id, type: 1, allow: VIEW_AND_SEND.toString(), deny: "0" },
      ],
    });
    channels.push(rolesChannel);
    lines.push(`Created #${ROLES_CHANNEL_NAME}.`);
    await sleep(400);
  }

  const named = channels.map((channel) => ({ id: channel.id, name: channel.name }));

  async function recent(channelId: string): Promise<ApiMessage[]> {
    return discord<ApiMessage[]>(token, "GET", `/channels/${channelId}/messages?limit=30`);
  }

  async function post(channelId: string, title: string, body: unknown) {
    const messages = await recent(channelId).catch(() => [] as ApiMessage[]);
    if (alreadyPosted(messages, me.id, title)) {
      lines.push(`#${channels.find((channel) => channel.id === channelId)?.name ?? channelId} already has “${title}”.`);
      return;
    }
    await discord(token, "POST", `/channels/${channelId}/messages`, body);
    lines.push(`Posted “${title}” in #${channels.find((channel) => channel.id === channelId)?.name ?? channelId}.`);
    await sleep(400);
  }

  if (rulesChannel) {
    await post(rulesChannel.id, "Rules", { embeds: [boardEmbed("Rules", rulesText(named))], allowed_mentions: { parse: [] } });
    if (!rulesChannel.topic) {
      await discord(token, "PATCH", `/channels/${rulesChannel.id}`, { topic: "Read these before you chat." });
    }
  } else lines.push("No #rules channel, so no rules were posted.");

  const announcements = channels.find((channel) => channel.name === "announcements");
  if (announcements) {
    await post(announcements.id, "Announcement", {
      embeds: [boardEmbed("Announcement", announcementText(named, guild.name))],
      allowed_mentions: { parse: [] },
    });
    if (!announcements.topic) {
      await discord(token, "PATCH", `/channels/${announcements.id}`, { topic: "Server news. Pick roles in #roles." });
    }
  }

  await post(rolesChannel.id, "Pick your roles", { embeds: [boardEmbed("Pick your roles", rolesIntroText())], allowed_mentions: { parse: [] } });

  for (const menu of ROLE_MENUS) {
    const options: Array<{ label: string; value: string; description: string }> = [];
    for (const spec of menu.roles) {
      const role = await ensureRole(token, guildId, roles, spec, botTop, lines);
      if (role) options.push({ label: spec.label, value: role.id, description: spec.description });
    }
    if (options.length < 1) {
      lines.push(`Skipped the ${menu.title} menu: no roles to offer.`);
      continue;
    }
    if (menu.exclusive && options.length < 2) {
      lines.push(`Skipped the ${menu.title} menu: it needs two choices.`);
      continue;
    }
    await post(rolesChannel.id, menu.title, menuPayload(menu, options));
  }

  for (const about of CHANNEL_ABOUT) {
    const channel = channels.find((item) => item.name === about.name && item.type === 0);
    if (!channel) continue;
    await post(channel.id, "About this channel", {
      embeds: [boardEmbed("About this channel", about.text(named))],
      allowed_mentions: { parse: [] },
    });
  }

  return { lines };
}
