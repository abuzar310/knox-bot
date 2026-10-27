// /gamble slots|coinflip: coins in, coins (sometimes) out. Bets are taken before the spin, so a lost bet can't be
// dodged, and the same person can't fire two spins in the same second.
import { SlashCommandBuilder, type ChatInputCommandInteraction, type SlashCommandSubcommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { ecoEmbed } from "../../../lib/economy-ui.js";
import { addWallet, takeWallet } from "../../../lib/xp.js";
import { MAX_BET, MIN_BET, flipCoin, rouletteColor, rouletteMultiplier, slotsPayout, spinSlots, spinRoulette, type RouletteBet } from "../../../lib/gamble.js";
import { startBlackjack } from "../lib/blackjack.js";
import { startHigherLower } from "../lib/higher-lower.js";

const COOLDOWN_MS = 3_000;

/** takes the bet; replies and returns false when it can't be taken */
async function placeBet(interaction: ChatInputCommandInteraction, client: KnoxClient, bet: number): Promise<boolean> {
  if (!interaction.guild) return false;
  const key = `${interaction.guild.id}:${interaction.user.id}`;
  const last = client.gambleCooldown.get(key) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    await interaction.reply({ content: "Easy there, one spin at a time.", ephemeral: true });
    return false;
  }
  client.gambleCooldown.set(key, Date.now());
  const taken = await takeWallet(client.db, interaction.guild.id, interaction.user.id, bet);
  if (!taken) {
    await interaction.reply({ content: `You don't have **${bet}** coins. Check /eco balance.`, ephemeral: true });
    return false;
  }
  return true;
}

const betOption = (s: SlashCommandSubcommandBuilder) =>
  s.addIntegerOption((o) => o.setName("bet").setDescription(`Coins to bet (${MIN_BET}–${MAX_BET})`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET));

export const gambleCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("gamble")
    .setDescription("Bet coins on the slots or a coin flip")
    .addSubcommand((s) => betOption(s.setName("slots").setDescription("Spin the slots: a pair pays 1.5×, three of a kind 10×, three sevens 30×")))
    .addSubcommand((s) =>
      betOption(s.setName("coinflip").setDescription("Double or nothing")).addStringOption((o) =>
        o.setName("side").setDescription("Your call").setRequired(true).addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }),
      ),
    )
    .addSubcommand((s) => betOption(s.setName("blackjack").setDescription("Hit or stand against the dealer; blackjack pays 3:2")))
    .addSubcommand((s) => betOption(s.setName("higher-lower").setDescription("Guess higher or lower to build a multiplier, cash out before you're wrong")))
    .addSubcommand((s) => betOption(s.setName("russian-roulette").setDescription("One bullet, six chambers — survive to win 1.2× your bet, get shot and lose it")))
    .addSubcommand((s) =>
      betOption(s.setName("roulette").setDescription("Red/black/odd/even pay 2×, green 14×, one number 36×"))
        .addStringOption((o) =>
          o
            .setName("on")
            .setDescription("What you're betting on")
            .setRequired(true)
            .addChoices(
              { name: "Red", value: "red" },
              { name: "Black", value: "black" },
              { name: "Odd", value: "odd" },
              { name: "Even", value: "even" },
              { name: "Green (0)", value: "green" },
              { name: "A single number", value: "number" },
            ),
        )
        .addIntegerOption((o) => o.setName("number").setDescription("Your number (0–36), only with 'A single number'").setMinValue(0).setMaxValue(36)),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const sym = ctx.settings?.features.currencySymbol ?? "💵";
    const sub = interaction.options.getSubcommand();
    const bet = interaction.options.getInteger("bet", true);

    if (sub === "russian-roulette") {
      if (!(await placeBet(interaction, ctx.client, bet))) return;
      const shot = Math.floor(Math.random() * 6) === 0;
      const payout = shot ? 0 : Math.floor(bet * 1.2);
      const wallet = payout > 0 ? await addWallet(ctx.client.db, interaction.guild.id, interaction.user.id, payout) : null;
      await interaction.reply({
        embeds: [
          ecoEmbed({
            user: interaction.user,
            tone: shot ? "loss" : "win",
            title: "🔫 Russian roulette",
            desc: shot ? `*click… **BANG!*** 💀 The chamber was loaded — **-${bet}** ${sym}` : `*click* — empty chamber. You walk away with **+${payout - bet}** ${sym} (paid ${payout}).`,
            footer: wallet !== null ? `Wallet: ${wallet}` : undefined,
          }),
        ],
      });
      return;
    }

    if (sub === "blackjack") {
      if (!(await placeBet(interaction, ctx.client, bet))) return;
      await startBlackjack(interaction, ctx.client, bet, ctx.settings?.embedColor);
      return;
    }

    if (sub === "higher-lower") {
      if (!(await placeBet(interaction, ctx.client, bet))) return;
      await startHigherLower(interaction, ctx.client, bet, ctx.settings?.embedColor, sym);
      return;
    }

    if (sub === "roulette") {
      const kind = interaction.options.getString("on", true) as RouletteBet["kind"];
      const number = interaction.options.getInteger("number");
      if (kind === "number" && number === null) {
        await interaction.reply({ content: "Give the number too: `/gamble roulette bet:50 on:A single number number:17`.", ephemeral: true });
        return;
      }
      if (!(await placeBet(interaction, ctx.client, bet))) return;
      const pocket = spinRoulette();
      const color = rouletteColor(pocket);
      const dot = color === "red" ? "🔴" : color === "black" ? "⚫" : "🟢";
      const payout = Math.floor(bet * rouletteMultiplier({ kind, number: number ?? undefined }, pocket));
      const wallet = payout > 0 ? await addWallet(ctx.client.db, interaction.guild.id, interaction.user.id, payout) : null;
      const picked = kind === "number" ? `number **${number}**` : `**${kind}**`;
      await interaction.reply({
        embeds: [
          ecoEmbed({
            user: interaction.user,
            tone: payout > bet ? "win" : "loss",
            title: "🎡 Roulette",
            desc: `The ball lands on ${dot} **${pocket}**.\nYou bet **${bet}** on ${picked} — ${payout > 0 ? `**+${payout - bet}** ${sym} (paid ${payout})` : `**-${bet}** ${sym}`}`,
            footer: wallet !== null ? `Wallet: ${wallet}` : undefined,
          }),
        ],
      });
      return;
    }

    if (sub === "slots") {
      if (!(await placeBet(interaction, ctx.client, bet))) return;
      const reels = spinSlots();
      const payout = slotsPayout(reels, bet);
      const wallet = payout > 0 ? await addWallet(ctx.client.db, interaction.guild.id, interaction.user.id, payout) : null;
      const result =
        payout === 0
          ? `No luck — **-${bet}** ${sym}`
          : payout > bet
            ? `${reels[0] === reels[1] && reels[1] === reels[2] ? (reels[0] === "7️⃣" ? "🎰 **JACKPOT!** " : "Three of a kind! ") : "A pair! "}**+${payout - bet}** ${sym} (paid ${payout})`
            : `Break even — **${payout}** ${sym} back`;
      await interaction.reply({
        embeds: [ecoEmbed({ user: interaction.user, tone: payout > bet ? "win" : payout === 0 ? "loss" : "info", title: "🎰 Slots", desc: `**［ ${reels.join("  ")} ］**\n${result}`, footer: wallet !== null ? `Wallet: ${wallet}` : undefined })],
      });
      return;
    }
    const side = interaction.options.getString("side", true) as "heads" | "tails";
    if (!(await placeBet(interaction, ctx.client, bet))) return;
    const landed = flipCoin();
    const won = landed === side;
    const wallet = won ? await addWallet(ctx.client.db, interaction.guild.id, interaction.user.id, bet * 2) : null;
    await interaction.reply({
      embeds: [
        ecoEmbed({
          user: interaction.user,
          tone: won ? "win" : "loss",
          title: "${sym} Coinflip",
          desc: `It landed **${landed}**. ${won ? `You called it — **+${bet}** ${sym}` : `You said ${side} — **-${bet}** ${sym}`}`,
          footer: wallet !== null ? `Wallet: ${wallet}` : undefined,
        }),
      ],
    });
  },
};

