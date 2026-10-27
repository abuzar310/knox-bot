// Higher-lower, UnbelievaBoat style. A number 1–100 is shown; guess whether the next one is higher or lower. Each
// correct guess multiplies your pot by how risky the guess was; a wrong guess (or a tie) loses it all. Cash out any
// time to bank bet × multiplier. The bet is taken up front; the ladder waits in memory and auto-cashes-out after 90s.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message } from "discord.js";
import { randomUUID } from "node:crypto";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { addWallet } from "../../../lib/xp.js";

export const HLO_PREFIX = "knox:hl:";
const TTL_MS = 90_000;
const HOUSE = 0.95; // 5% edge baked into each risky step

export type HiLoGame = {
  guildId: string;
  userId: string;
  username: string;
  bet: number;
  color?: string;
  sym: string;
  current: number;
  multiplier: number;
  message: Message | null;
  timer: ReturnType<typeof setTimeout>;
};

const roll = () => 1 + Math.floor(Math.random() * 100);
const cashValue = (g: HiLoGame) => Math.floor(g.bet * g.multiplier);

function row(id: string, cash: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${HLO_PREFIX}higher:${id}`).setLabel("Higher").setEmoji("⬆️").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`${HLO_PREFIX}lower:${id}`).setLabel("Lower").setEmoji("⬇️").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`${HLO_PREFIX}cash:${id}`).setLabel(`Cash out (${cash})`).setEmoji("💰").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

function tableEmbed(game: HiLoGame, line?: string) {
  return knoxEmbed(game.color)
    .setTitle(`🔢 Higher-lower · ${game.username} bet ${game.bet}`)
    .setDescription(`The number is **${game.current}** (1–100).\nMultiplier **×${game.multiplier.toFixed(2)}** · cash out for **${cashValue(game)}** ${game.sym}\n\nWill the next number be higher or lower?${line ? `\n\n${line}` : ""}`);
}

async function resolve(client: KnoxClient, id: string, game: HiLoGame, via: ButtonInteraction | null, outcome: { kind: "cash" } | { kind: "loss"; next: number }) {
  clearTimeout(game.timer);
  client.higherLower.delete(id);
  let line: string;
  if (outcome.kind === "cash") {
    const payout = cashValue(game);
    const wallet = await addWallet(client.db, game.guildId, game.userId, payout);
    line = `💰 Cashed out **${payout}** ${game.sym} (net **${payout - game.bet >= 0 ? "+" : ""}${payout - game.bet}**). Wallet **${wallet}**.`;
  } else {
    line = `It was **${outcome.next}** — wrong. You lose **${game.bet}** ${game.sym}.`;
  }
  const payload = { embeds: [tableEmbed(game, line)], components: [row(id, cashValue(game), true)] };
  if (via) await via.update(payload).catch(() => undefined);
  else await game.message?.edit(payload).catch(() => undefined);
}

/** the /gamble higher-lower entry: assumes the bet is already taken */
export async function startHigherLower(interaction: ChatInputCommandInteraction, client: KnoxClient, bet: number, color: string | undefined, sym: string) {
  if (!interaction.guild) return;
  const id = randomUUID().slice(0, 8);
  const game: HiLoGame = {
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    username: interaction.user.username,
    bet,
    color,
    sym,
    current: roll(),
    multiplier: 1,
    message: null,
    timer: setTimeout(() => void 0, 0),
  };
  clearTimeout(game.timer);
  game.timer = setTimeout(() => {
    const live = client.higherLower.get(id);
    if (live) void resolve(client, id, live, null, { kind: "cash" });
  }, TTL_MS);
  client.higherLower.set(id, game);
  await interaction.reply({ embeds: [tableEmbed(game)], components: [row(id, cashValue(game))] });
  game.message = await interaction.fetchReply().catch(() => null);
}

export async function handleHigherLowerButton(interaction: ButtonInteraction, client: KnoxClient) {
  const match = interaction.customId.slice(HLO_PREFIX.length).match(/^(higher|lower|cash):([a-z0-9]+)$/);
  if (!match) return;
  const [, action, id] = match;
  const game = client.higherLower.get(id!);
  if (!game) {
    await interaction.reply({ content: "That game is over.", ephemeral: true });
    return;
  }
  if (interaction.user.id !== game.userId) {
    await interaction.reply({ content: "Not your game — start your own with /gamble higher-lower.", ephemeral: true });
    return;
  }
  if (action === "cash") {
    await resolve(client, id!, game, interaction, { kind: "cash" });
    return;
  }
  const next = roll();
  const correct = action === "higher" ? next > game.current : next < game.current;
  if (!correct) {
    await resolve(client, id!, game, interaction, { kind: "loss", next });
    return;
  }
  // a correct guess grows the pot by how unlikely it was; a near-certain guess never shrinks it
  const prob = action === "higher" ? (100 - game.current) / 100 : (game.current - 1) / 100;
  const step = Math.max(1, HOUSE / Math.max(prob, 0.01));
  game.multiplier *= step;
  game.current = next;
  // restart the walk-away timer
  clearTimeout(game.timer);
  game.timer = setTimeout(() => {
    const live = client.higherLower.get(id!);
    if (live) void resolve(client, id!, live, null, { kind: "cash" });
  }, TTL_MS);
  await interaction.update({ embeds: [tableEmbed(game, `✅ **${next}** — correct! Keep going or cash out.`)], components: [row(id!, cashValue(game))] });
}
