import { EmbedBuilder } from "discord.js";
import { BRAND } from "@knox/shared";

function colorFromHex(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

export function knoxEmbed(embedColorHex?: string) {
  return new EmbedBuilder().setColor(
    embedColorHex ? colorFromHex(embedColorHex) : BRAND.embedColor,
  );
}
