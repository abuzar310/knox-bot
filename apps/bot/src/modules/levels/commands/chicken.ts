// /chicken — chicken fight (UnbelievaBoat cock-fight) as its own command: buy, fight, stats.
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { ecoEmbed } from "../../../lib/economy-ui.js";
import { buyChicken, fightChicken, getChicken, randomStartStrength } from "../lib/chicken.js";

const COOLDOWN_MS = 3_000;
type EconomyFace = { currencySymbol: string; chickenPrice: number; chickenStrengthMin: number; chickenStrengthMax: number };

export const chickenCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("chicken")
    .setDescription("Chicken fight: buy a chicken and bet it in fights (UnbelievaBoat cock-fight)")
    .addSubcommand((s) => s.setName("buy").setDescription("Buy a chicken to fight"))
    .addSubcommand((s) =>
      s
        .setName("fight")
        .setDescription("Bet your chicken: a win pays the bet and makes it stronger, a loss kills it")
        .addIntegerOption((o) => o.setName("bet").setDescription("Coins to bet").setRequired(true).setMinValue(1).setMaxValue(10_000_000)),
    )
    .addSubcommand((s) =>
      s
        .setName("stats")
        .setDescription("Your chicken's strength and win streak")
        .addUserOption((o) => o.setName("user").setDescription("Whose chicken").setRequired(false)),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    let sub = "stats";
    try {
      sub = interaction.options.getSubcommand() ?? "stats";
    } catch {
      // bare "!chicken" with no subcommand → show stats
    }
    await handleChicken(interaction, ctx.client, ctx.settings?.features, sub);
  },
};

async function handleChicken(interaction: ChatInputCommandInteraction, client: KnoxClient, f: EconomyFace | undefined, sub: string) {
  if (!interaction.guild) return;
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const sym = f?.currencySymbol ?? "💵";
  const price = f?.chickenPrice ?? 500;

  if (sub !== "buy" && sub !== "fight") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const { strength, wins } = await getChicken(client.db, guildId, target.id);
    const mine = target.id === userId;
    const desc =
      strength === null
        ? mine
          ? `You don't have a chicken. Buy one with \`/chicken buy\` for **${price}** ${sym}.`
          : `${target} doesn't have a chicken right now.`
        : `🐔 Strength **${strength}%** (that's the win chance)\n🏆 Win streak **${wins}**`;
    await interaction.reply({ embeds: [ecoEmbed({ user: target, tone: "info", title: "🐔 Chicken", desc })] });
    return;
  }

  const key = `${guildId}:${userId}`;
  if (Date.now() - (client.gambleCooldown.get(key) ?? 0) < COOLDOWN_MS) {
    await interaction.reply({ content: "Easy there, one at a time.", ephemeral: true });
    return;
  }
  client.gambleCooldown.set(key, Date.now());

  if (sub === "buy") {
    const start = randomStartStrength(f?.chickenStrengthMin ?? 50, f?.chickenStrengthMax ?? 70);
    const res = await buyChicken(client.db, guildId, userId, price, start);
    if (res === "has") {
      await interaction.reply({ content: "You already have a chicken fighting for you. Check `/chicken stats`.", ephemeral: true });
      return;
    }
    if (res === "broke") {
      await interaction.reply({ content: `You need **${price}** ${sym} to buy a chicken. Check /eco balance.`, ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [
        ecoEmbed({
          user: interaction.user,
          tone: "gain",
          title: "🐔 New chicken!",
          desc: `Bought for **${price}** ${sym}. Starting strength **${start}%**.\nFight it with \`/chicken fight <bet>\` — every win makes it stronger, but one loss kills it.`,
        }),
      ],
    });
    return;
  }

  // fight
  const bet = interaction.options.getInteger("bet", true);
  const res = await fightChicken(client.db, guildId, userId, bet);
  if (res.result === "nochicken") {
    await interaction.reply({ content: "You have no chicken. Buy one first: `/chicken buy`.", ephemeral: true });
    return;
  }
  if (res.result === "broke") {
    await interaction.reply({ content: `You don't have **${bet}** ${sym} to bet. Check /eco balance.`, ephemeral: true });
    return;
  }
  if (res.result === "win") {
    await interaction.reply({
      embeds: [
        ecoEmbed({
          user: interaction.user,
          tone: "win",
          title: "🐔 Chicken wins!",
          desc: `Your chicken won — **+${bet}** ${sym}.\nStrength is now **${res.strength}%**, win streak **${res.wins}**. Go again with \`/chicken fight ${bet}\`.`,
          footer: `Wallet: ${res.wallet}`,
        }),
      ],
    });
    return;
  }
  await interaction.reply({
    embeds: [
      ecoEmbed({
        user: interaction.user,
        tone: "loss",
        title: "🐔💀 Chicken lost",
        desc: `Your chicken lost after **${res.wins}** win${res.wins === 1 ? "" : "s"} and died — **-${bet}** ${sym}.\nBuy a new one with \`/chicken buy\` to keep going.`,
        footer: `Wallet: ${res.wallet}`,
      }),
    ],
  });
}
