// A clean, consistent embed "card" for every economy reply — member as the author line, green for gains, red for
// losses, gold for wins, blurple for info. Original ZARU styling inspired by how economy bots lay out their replies.
import { EmbedBuilder, type User } from "discord.js";

const GAIN = 0x57f287;
const LOSS = 0xed4245;
const WIN = 0xf1c40f;
const INFO = 0x5865f2;

export type EcoTone = "gain" | "loss" | "win" | "info";

export function ecoEmbed(opts: {
  user: User;
  desc: string;
  tone?: EcoTone;
  title?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
}) {
  const color = opts.tone === "gain" ? GAIN : opts.tone === "loss" ? LOSS : opts.tone === "win" ? WIN : INFO;
  const embed = new EmbedBuilder().setColor(color).setAuthor({ name: opts.user.username, iconURL: opts.user.displayAvatarURL() }).setDescription(opts.desc);
  if (opts.title) embed.setTitle(opts.title);
  if (opts.fields?.length) embed.addFields(opts.fields);
  if (opts.footer) embed.setFooter({ text: opts.footer });
  return embed;
}
