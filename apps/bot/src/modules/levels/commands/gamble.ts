// /slots and /coinflip: coins in, coins (sometimes) out. Bets are taken before the spin, so a lost bet can't be
// dodged, and the same person can't fire two spins in the same second.
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { addWallet, takeWallet } from "../../../lib/xp.js";
import { MAX_BET, MIN_BET, flipCoin, slotsPayout, spinSlots } from "../../../lib/gamble.js";

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

const betOption = (b: SlashCommandBuilder) =>
  b.addIntegerOption((o) => o.setName("bet").setDescription(`Coins to bet (${MIN_BET}–${MAX_BET})`).setRequired(true).setMinValue(MIN_BET).setMaxValue(MAX_BET));

export const slotsCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: betOption(new SlashCommandBuilder().setName("slots").setDescription("Spin the slots: a pair pays 1.5×, three of a kind 10×, three sevens 30×")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const bet = interaction.options.getInteger("bet", true);
    if (!(await placeBet(interaction, ctx.client, bet))) return;
    const reels = spinSlots();
    const payout = slotsPayout(reels, bet);
    const wallet = payout > 0 ? await addWallet(ctx.client.db, interaction.guild.id, interaction.user.id, payout) : null;
    const line = `**[ ${reels.join(" | ")} ]**`;
    const result =
      payout === 0
        ? `No luck: **-${bet}** coins.`
        : payout > bet
          ? `${reels[0] === reels[1] && reels[1] === reels[2] ? (reels[0] === "7️⃣" ? "JACKPOT! " : "Three of a kind! ") : "A pair. "}**+${payout - bet}** coins (paid ${payout}).`
          : `Break even: **${payout}** back.`;
    await interaction.reply({
      embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle(`${interaction.user.username} spins`).setDescription(`${line}\n${result}${wallet !== null ? `\nWallet: **${wallet}**` : ""}`)],
    });
  },
};

export const coinflipCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: betOption(new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin for double or nothing")).addStringOption((o) =>
    o.setName("side").setDescription("Your call").setRequired(true).addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }),
  ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const bet = interaction.options.getInteger("bet", true);
    const side = interaction.options.getString("side", true) as "heads" | "tails";
    if (!(await placeBet(interaction, ctx.client, bet))) return;
    const landed = flipCoin();
    const won = landed === side;
    const wallet = won ? await addWallet(ctx.client.db, interaction.guild.id, interaction.user.id, bet * 2) : null;
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle(`${interaction.user.username} flips`)
          .setDescription(`It's **${landed}**. ${won ? `You called it: **+${bet}** coins.\nWallet: **${wallet}**` : `You said ${side}: **-${bet}** coins.`}`),
      ],
    });
  },
};
