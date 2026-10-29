// Self-assign boards. Gender and age are one choice each (the menu swaps the other role off).
// Games, platform, and pings stack. Colors are one color. These are the sets people actually
// put on a Carl-bot / ProBot role menu: gender, 18+ / 18-, games, device, a color, and ping opt-in.

export const BOARD_FOOTER = "ZARU board";
export const ROLES_CHANNEL_NAME = "roles";

export type SelfRoleSpec = {
  /** created when none of the reuse names exist */
  name: string;
  label: string;
  description: string;
  color: number;
  reuseNames?: string[];
  mentionable?: boolean;
};

export type RoleMenuSpec = {
  title: string;
  description: string;
  placeholder: string;
  /** one choice: selecting another role in this menu removes the previous one */
  exclusive: boolean;
  roles: SelfRoleSpec[];
};

export const ROLE_MENUS: RoleMenuSpec[] = [
  {
    title: "Gender",
    description: "Pick one. Choosing the other replaces it. Clear the menu to take it off.",
    placeholder: "Male or Female",
    exclusive: true,
    roles: [
      { name: "MALE", label: "Male", description: "Male", color: 0x5865f2, reuseNames: ["MALE", "Male"] },
      { name: "FEMALE", label: "Female", description: "Female", color: 0xff67c4, reuseNames: ["FEMALE", "Female"] },
    ],
  },
  {
    title: "Age",
    description: "Pick one. 18+ or 18-. Choosing the other replaces it.",
    placeholder: "18+ or 18-",
    exclusive: true,
    roles: [
      { name: "18+", label: "18+", description: "I am 18 or older", color: 0x57f287 },
      { name: "18-", label: "18-", description: "I am under 18", color: 0xfee75c },
    ],
  },
  {
    title: "Games",
    description: "Pick every game you play. Open the menu again to change them.",
    placeholder: "Games you play",
    exclusive: false,
    roles: [
      { name: "COD God", label: "COD", description: "Call of Duty", color: 0xe67e22, reuseNames: ["COD God"] },
      { name: "Minecraft", label: "Minecraft", description: "Minecraft", color: 0x3ba55d },
      { name: "GTA", label: "GTA", description: "GTA", color: 0x1abc9c },
      { name: "Valorant", label: "Valorant", description: "Valorant", color: 0xff4655 },
      { name: "Free Fire", label: "Free Fire", description: "Free Fire", color: 0xff6a00 },
    ],
  },
  {
    title: "Platform",
    description: "Where you play. Pick any that fit.",
    placeholder: "PC, mobile, or console",
    exclusive: false,
    roles: [
      { name: "PC", label: "PC", description: "I play on PC", color: 0x99aab5 },
      { name: "Mobile", label: "Mobile", description: "I play on mobile", color: 0xeb459e },
      { name: "Console", label: "Console", description: "PlayStation or Xbox", color: 0x5865f2 },
    ],
  },
  {
    title: "Colors",
    description: "One color for your name. Picking another replaces it.",
    placeholder: "Pick a color",
    exclusive: true,
    roles: [
      { name: "Blue", label: "Blue", description: "Blue", color: 0x3498db, reuseNames: ["Blue"] },
      { name: "Pink", label: "Pink", description: "Pink", color: 0xeb459e, reuseNames: ["Pink"] },
      { name: "Orange", label: "Orange", description: "Orange", color: 0xe67e22, reuseNames: ["Orange"] },
      { name: "green", label: "Green", description: "Green", color: 0x57f287, reuseNames: ["green", "Green"] },
    ],
  },
  {
    title: "Pings",
    description: "Opt in to pings. Clear a choice to stop.",
    placeholder: "What should we ping you for?",
    exclusive: false,
    roles: [
      { name: "Announcements", label: "Announcements", description: "Server news", color: 0xfee75c, mentionable: true },
      { name: "Giveaways", label: "Giveaways", description: "Giveaways", color: 0xeb459e, mentionable: true },
    ],
  },
];

export function menuMaxValues(menu: RoleMenuSpec): number {
  return menu.exclusive ? 1 : Math.max(1, menu.roles.length);
}

export function isBoardEmbed(embed: { footer?: { text?: string | null } | null }): boolean {
  return embed.footer?.text === BOARD_FOOTER;
}

export type NamedChannel = { id: string; name: string };

function mention(channels: NamedChannel[], name: string): string {
  const found = channels.find((channel) => channel.name === name);
  return found ? `<#${found.id}>` : `#${name}`;
}

export function rulesText(channels: NamedChannel[]): string {
  const at = (name: string) => mention(channels, name);
  return [
    "1. Be respectful. No harassment, slurs, or piling on someone.",
    "2. No NSFW, gore, or illegal content.",
    "3. No scams, free-account drops, or @everyone with random images.",
    `4. Talk in ${at("chat")}. Clips in ${at("media")}. Memes in ${at("memes")}. Ideas in ${at("suggestions")}. Commands in ${at("bot-commands")}.`,
    `5. Pick your roles in ${at("roles")}: Male or Female, 18+ or 18-, and the games you play.`,
    "6. Staff have the final say. Need help? Open a ticket.",
    "",
    "When you join, ZARU DMs you to pick those roles. You can change them any time.",
  ].join("\n");
}

export function announcementText(channels: NamedChannel[], server: string): string {
  const at = (name: string) => mention(channels, name);
  return [
    `Boards are up for **${server}**.`,
    "",
    `Read ${at("rules")} before you chat.`,
    "When you join, ZARU asks you to pick Male or Female, 18+ or 18-, and your games.",
    `Change them any time in ${at("roles")}.`,
    "",
    `Hang out in ${at("chat")} and the voice channels.`,
  ].join("\n");
}

export function rolesIntroText(): string {
  return [
    "Pick what fits you. Each menu saves on its own.",
    "",
    "• Gender and age are one choice. Picking the other removes the first.",
    "• Games, platform, and pings can be more than one.",
    "• Colors are one color. Clear the menu to take it off.",
    "",
    "ZARU DMs you this ask when you join.",
  ].join("\n");
}

/** one line in the public channels people actually talk in */
export const CHANNEL_ABOUT: Array<{ name: string; text: (channels: NamedChannel[]) => string }> = [
  { name: "chat", text: (channels) => `This is the main chat. Keep it friendly. Bot commands go in ${mention(channels, "bot-commands")}.` },
  { name: "media", text: () => "Photos and clips go here. No scam posts and no @everyone ads." },
  { name: "memes", text: () => "Memes go here." },
  { name: "suggestions", text: () => "One idea per message. Staff read this channel." },
  { name: "bot-commands", text: (channels) => `Run bot commands here so ${mention(channels, "chat")} stays readable. Members use \`?\`.` },
  { name: "level-up", text: () => "Level-up messages show up here." },
  { name: "starboard", text: () => "Posts that earn enough stars are copied here." },
];

/** DM sent on join when this server has a ZARU role board */
export function joinRoleAsk(server: string): string {
  return [
    `Hey. Welcome to **${server}**.`,
    "",
    "Pick your roles:",
    "• Male or Female (one)",
    "• 18+ or 18- (one)",
    "• Games you play",
    "",
    "Use the menus in the roles channel. You can change them any time.",
  ].join("\n");
}
