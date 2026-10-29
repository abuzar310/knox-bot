// #chat stays visible, and Send Messages is denied on the member role.
// 18+, 18-, and Chat access (people already in the server) are allowed to talk.
import { BOARD_FOOTER, CHANNEL_ABOUT, CHAT_PASS_ROLE, rulesText } from "./join-roles.js";

const API = "https://discord.com/api/v10";
const VIEW = 1n << 10n;
const SEND = 1n << 11n;
const VIEW_AND_SEND = VIEW | SEND;

type Overwrite = { id: string; type: number; allow: string; deny: string };
type ApiRole = { id: string; name: string };
type ApiChannel = { id: string; name: string; type: number; permission_overwrites?: Overwrite[] };
type ApiMessage = { id: string; author: { id: string }; embeds: Array<{ title?: string | null; description?: string | null; color?: number; footer?: { text?: string } }> };
type ApiMember = { user?: { id: string; bot?: boolean }; roles: string[] };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discord<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": "ZARU (gates, 1.0)",
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

function withOverwrite(list: Overwrite[], id: string, allow: bigint, deny: bigint): Overwrite[] {
  return [...list.filter((entry) => entry.id !== id), { id, type: 0, allow: allow.toString(), deny: deny.toString() }];
}

export async function installChatGate(token: string, guildId: string, memberRoleId: string): Promise<string[]> {
  const lines: string[] = [];
  const roles = await discord<ApiRole[]>(token, "GET", `/guilds/${guildId}/roles`);
  const channels = await discord<ApiChannel[]>(token, "GET", `/guilds/${guildId}/channels`);
  const chat = channels.find((channel) => channel.name === "chat" && channel.type === 0);
  const older = roles.find((role) => role.name === "18+");
  const younger = roles.find((role) => role.name === "18-");
  if (!chat || !older || !younger) throw new Error("Need #chat plus the 18+ and 18- roles before the age gate can close chat.");
  if (!roles.some((role) => role.id === memberRoleId)) throw new Error("The member role is missing.");

  let pass = roles.find((role) => role.name.toLowerCase() === CHAT_PASS_ROLE.toLowerCase());
  if (!pass) {
    pass = await discord<ApiRole>(token, "POST", `/guilds/${guildId}/roles`, {
      name: CHAT_PASS_ROLE,
      color: 0,
      hoist: false,
      mentionable: false,
      permissions: "0",
    });
    lines.push(`Created the ${CHAT_PASS_ROLE} role.`);
    await sleep(400);
  }

  const members = await discord<ApiMember[]>(token, "GET", `/guilds/${guildId}/members?limit=1000`);
  let granted = 0;
  for (const member of members) {
    if (!member.user || member.user.bot || member.roles.includes(pass.id)) continue;
    await discord(token, "PUT", `/guilds/${guildId}/members/${member.user.id}/roles/${pass.id}`);
    granted += 1;
    await sleep(350);
  }
  lines.push(`Gave ${CHAT_PASS_ROLE} to ${granted} people already here.`);

  const current = await discord<ApiChannel>(token, "GET", `/channels/${chat.id}`);
  let overwrites = current.permission_overwrites ?? [];
  overwrites = withOverwrite(overwrites, memberRoleId, VIEW, SEND);
  for (const roleId of [pass.id, older.id, younger.id]) {
    overwrites = withOverwrite(overwrites, roleId, VIEW_AND_SEND, 0n);
  }
  await discord(token, "PATCH", `/channels/${chat.id}`, { permission_overwrites: overwrites });
  lines.push("Chat is open to read. Talking needs 18+, 18-, or Chat access.");

  const named = channels.map((channel) => ({ id: channel.id, name: channel.name }));
  const me = await discord<{ id: string }>(token, "GET", "/users/@me");
  const edits: Array<{ name: string; title: string; description: string }> = [
    { name: "rules", title: "Rules", description: rulesText(named) },
    ...CHANNEL_ABOUT.filter((about) => about.name === "chat" || about.name === "media" || about.name === "memes").map((about) => ({
      name: about.name,
      title: "About this channel",
      description: about.text(named),
    })),
  ];
  for (const edit of edits) {
    const channel = channels.find((item) => item.name === edit.name);
    if (!channel) continue;
    const messages = await discord<ApiMessage[]>(token, "GET", `/channels/${channel.id}/messages?limit=30`);
    const message = messages.find(
      (item) => item.author.id === me.id && item.embeds.some((embed) => embed.footer?.text === BOARD_FOOTER && embed.title === edit.title),
    );
    const embed = message?.embeds.find((item) => item.title === edit.title);
    if (!message || !embed) continue;
    await discord(token, "PATCH", `/channels/${channel.id}/messages/${message.id}`, {
      embeds: [{ title: edit.title, description: edit.description, color: embed.color, footer: { text: BOARD_FOOTER } }],
    });
    lines.push(`Updated “${edit.title}” in #${edit.name}.`);
    await sleep(400);
  }
  return lines;
}
