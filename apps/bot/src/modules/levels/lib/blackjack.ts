// Blackjack with Hit/Stand buttons, UnbelievaBoat style. The bet is taken up front; a natural 21 pays 3:2 at once;
// otherwise the hand waits in memory for the player's buttons and stands by itself after 90 seconds.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction, type Message } from "discord.js";
import { randomUUID } from "node:crypto";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { addWallet } from "../../../lib/xp.js";
import { dealerPlay, handLabel, handValue, newDeck, type Card } from "../../../lib/gamble.js";

export const BJ_PREFIX = "knox:bj:";
const TTL_MS = 90_000;

export type BlackjackGame = {
  guildId: string;
  userId: string;
  username: string;
  bet: number;
  color?: string;
  deck: Card[];
  player: Card[];
  dealer: Card[];
  message: Message | null;
  timer: ReturnType<typeof setTimeout>;
};

const row = (id: string, disabled = false) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${BJ_PREFIX}hit:${id}`).setLabel("Hit").setEmoji("🃏").setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`${BJ_PREFIX}stand:${id}`).setLabel("Stand").setEmoji("✋").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );

function tableEmbed(game: BlackjackGame, opts: { revealDealer: boolean; line?: string }) {
  const dealerShown = opts.revealDealer ? `${handLabel(game.dealer)} (${handValue(game.dealer)})` : `${handLabel([game.dealer[0]!])} 🂠`;
  return knoxEmbed(game.color)
    .setTitle(`🃏 Blackjack · ${game.username} bets ${game.bet}`)
    .setDescription(`**Your hand:** ${handLabel(game.player)} (**${handValue(game.player)}**)\n**Dealer:** ${dealerShown}${opts.line ? `\n\n${opts.line}` : ""}`);
}

/** finishes the hand: dealer draws, payout lands, buttons grey out */
async function resolve(client: KnoxClient, id: string, game: BlackjackGame, via: ButtonInteraction | null, busted = false) {
  clearTimeout(game.timer);
  client.blackjack.delete(id);
  let line: string;
  if (busted) {
    line = `💥 Bust! **-${game.bet}**.`;
  } else {
    dealerPlay(game.deck, game.dealer);
    const you = handValue(game.player);
    const house = handValue(game.dealer);
    if (house > 21 || you > house) {
      const wallet = await addWallet(client.db, game.guildId, game.userId, game.bet * 2);
      line = `${house > 21 ? "Dealer busts! " : ""}🎉 You win **+${game.bet}** (wallet **${wallet}**).`;
    } else if (you === house) {
      await addWallet(client.db, game.guildId, game.userId, game.bet);
      line = `🤝 Push — your **${game.bet}** is back.`;
    } else {
      line = `🏦 Dealer wins: **-${game.bet}**.`;
    }
  }
  const payload = { embeds: [tableEmbed(game, { revealDealer: true, line })], components: [row(id, true)] };
  if (via) await via.update(payload).catch(() => undefined);
  else await game.message?.edit(payload).catch(() => undefined);
}

/** the /gamble blackjack entry: assumes the bet is already taken */
export async function startBlackjack(interaction: ChatInputCommandInteraction, client: KnoxClient, bet: number, color?: string) {
  if (!interaction.guild) return;
  const deck = newDeck();
  const player = [deck.pop()!, deck.pop()!];
  const dealer = [deck.pop()!, deck.pop()!];
  const id = randomUUID().slice(0, 8);
  const game: BlackjackGame = { guildId: interaction.guild.id, userId: interaction.user.id, username: interaction.user.username, bet, color, deck, player, dealer, message: null, timer: setTimeout(() => void 0, 0) };
  clearTimeout(game.timer);

  if (handValue(player) === 21) {
    const payout = Math.floor(bet * 2.5);
    const wallet = await addWallet(client.db, game.guildId, game.userId, payout);
    await interaction.reply({ embeds: [tableEmbed(game, { revealDealer: true, line: `♠️ **Blackjack!** Paid 3:2 — **+${payout - bet}** (wallet **${wallet}**).` })] });
    return;
  }

  game.timer = setTimeout(() => {
    const live = client.blackjack.get(id);
    if (live) void resolve(client, id, live, null);
  }, TTL_MS);
  client.blackjack.set(id, game);
  await interaction.reply({ embeds: [tableEmbed(game, { revealDealer: false })], components: [row(id)] });
  game.message = await interaction.fetchReply().catch(() => null);
}

export async function handleBlackjackButton(interaction: ButtonInteraction, client: KnoxClient) {
  const match = interaction.customId.slice(BJ_PREFIX.length).match(/^(hit|stand):([a-z0-9]+)$/);
  if (!match) return;
  const [, action, id] = match;
  const game = client.blackjack.get(id!);
  if (!game) {
    await interaction.reply({ content: "That hand is over.", ephemeral: true });
    return;
  }
  if (interaction.user.id !== game.userId) {
    await interaction.reply({ content: "Not your hand — start your own with /gamble blackjack.", ephemeral: true });
    return;
  }
  if (action === "hit") {
    game.player.push(game.deck.pop()!);
    const total = handValue(game.player);
    if (total > 21) return resolve(client, id!, game, interaction, true);
    if (total === 21) return resolve(client, id!, game, interaction);
    await interaction.update({ embeds: [tableEmbed(game, { revealDealer: false })], components: [row(id!)] });
    return;
  }
  await resolve(client, id!, game, interaction);
}
