// /animal — UnbelievaBoat-style animal racing: store, buy, inventory, feed, race.
import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { ecoEmbed } from "../../../lib/economy-ui.js";
import { addWallet, takeWallet } from "../../../lib/xp.js";
import {
  ANIMAL_ORDER,
  ANIMAL_TYPES,
  PROVISIONS,
  applyRace,
  botOpponent,
  buyAnimal,
  feedAnimal,
  listAnimals,
  performance,
  pickAnimal,
  type Animal,
  type AnimalType,
} from "../lib/animals.js";

const raceCooldown = new Map<string, number>();
const RACE_COOLDOWN_MS = 4_000;
const BOT_NAMES = ["Dash", "Bolt", "Rocky", "Zoom", "Turbo", "Ace"];

function label(a: Pick<Animal, "type" | "nickname">) {
  const t = ANIMAL_TYPES[a.type as AnimalType];
  return `${t.emoji} ${a.nickname ?? t.label}`;
}

function ordinal(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

export const animalCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("animal")
    .setDescription("Animal racing: buy animals, feed them, and race them for coins")
    .addSubcommand((s) => s.setName("store").setDescription("See the animals and food you can buy"))
    .addSubcommand((s) =>
      s
        .setName("buy")
        .setDescription("Buy an animal")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Which animal")
            .setRequired(true)
            .addChoices(
              { name: "🐌 Snail", value: "snail" },
              { name: "🐦 Pigeon", value: "pigeon" },
              { name: "🐕 Greyhound", value: "greyhound" },
              { name: "🐎 Horse", value: "horse" },
            ),
        )
        .addStringOption((o) => o.setName("nickname").setDescription("Name it (can't be changed later)").setMaxLength(32)),
    )
    .addSubcommand((s) => s.setName("inventory").setDescription("Your animals and their stats"))
    .addSubcommand((s) =>
      s
        .setName("feed")
        .setDescription("Feed an animal its provisions to refill energy")
        .addStringOption((o) => o.setName("animal").setDescription("Nickname or type (defaults to your first)")),
    )
    .addSubcommand((s) =>
      s
        .setName("race")
        .setDescription("Enter an animal in a race — bet up to 2× its price")
        .addIntegerOption((o) => o.setName("bet").setDescription("Coins to bet").setRequired(true).setMinValue(1).setMaxValue(10_000_000))
        .addStringOption((o) => o.setName("animal").setDescription("Nickname or type (defaults to your first)")),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const db = ctx.client.db;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sym = ctx.settings?.features.currencySymbol ?? "💵";
    const color = ctx.settings?.embedColor;

    if (sub === "store") {
      const rows = ANIMAL_ORDER.map((k) => {
        const t = ANIMAL_TYPES[k];
        const p = PROVISIONS[k];
        return `${t.emoji} **${t.label}** — **${t.price}** ${sym} · lives ${t.lifespan} races · food ${p.emoji} ${p.name} (${p.price} ${sym})`;
      }).join("\n");
      await interaction.reply({
        embeds: [
          knoxEmbed(color)
            .setTitle("🏁 Animal racing — store")
            .setDescription(`Buy with \`/animal buy\`, feed with \`/animal feed\`, race with \`/animal race <bet>\`.\n\n${rows}`)
            .setFooter({ text: "Same-type animals race each other · bet up to 2× the animal's price" }),
        ],
      });
      return;
    }

    if (sub === "buy") {
      const type = interaction.options.getString("type", true) as AnimalType;
      const nickname = interaction.options.getString("nickname");
      const res = await buyAnimal(db, guildId, userId, type, nickname);
      if (!res.ok) {
        await interaction.reply({
          content:
            res.reason === "full"
              ? "You've hit the 10-animal limit. Race or retire some first."
              : `You need **${ANIMAL_TYPES[type].price}** ${sym} to buy a ${ANIMAL_TYPES[type].label}.`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        embeds: [
          ecoEmbed({
            user: interaction.user,
            tone: "gain",
            title: "🏁 New racer!",
            desc: `You bought ${label(res.animal)} for **${ANIMAL_TYPES[type].price}** ${sym}.\nFeed it with \`/animal feed\`, then race with \`/animal race <bet>\`.`,
          }),
        ],
      });
      return;
    }

    if (sub === "inventory") {
      const list = await listAnimals(db, guildId, userId);
      if (!list.length) {
        await interaction.reply({ content: "You have no animals yet. Buy one with `/animal buy`.", ephemeral: true });
        return;
      }
      const lines = list
        .map((a) => {
          const t = ANIMAL_TYPES[a.type as AnimalType];
          return `${label(a)} — age ${a.age}/${t.lifespan} · ❤️ ${a.health} · ⚡ ${a.energy} · ✨ ${a.experience} xp`;
        })
        .join("\n");
      await interaction.reply({ embeds: [knoxEmbed(color).setTitle("🐾 Your animals").setDescription(lines)] });
      return;
    }

    if (sub === "feed") {
      const query = interaction.options.getString("animal");
      const list = await listAnimals(db, guildId, userId);
      const animal = pickAnimal(list, query);
      if (!animal) {
        await interaction.reply({ content: query ? `No animal matches "${query}". Check /animal inventory.` : "You have no animals. Buy one with `/animal buy`.", ephemeral: true });
        return;
      }
      const prov = PROVISIONS[animal.type as AnimalType];
      const res = await feedAnimal(db, guildId, userId, animal);
      if (res === "broke") {
        await interaction.reply({ content: `You need **${prov.price}** ${sym} for ${prov.emoji} ${prov.name}.`, ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [
          ecoEmbed({
            user: interaction.user,
            tone: "info",
            title: "🍽️ Fed",
            desc: `${label(animal)} ate ${prov.emoji} ${prov.name} (**-${prov.price}** ${sym}).\n⚡ Energy **${res.energy}** · ❤️ Health **${res.health}**`,
          }),
        ],
      });
      return;
    }

    // race
    const bet = interaction.options.getInteger("bet", true);
    const query = interaction.options.getString("animal");
    const list = await listAnimals(db, guildId, userId);
    const animal = pickAnimal(list, query);
    if (!animal) {
      await interaction.reply({ content: query ? `No animal matches "${query}".` : "You have no animals to race. Buy one with `/animal buy`.", ephemeral: true });
      return;
    }
    const t = ANIMAL_TYPES[animal.type as AnimalType];
    const maxBet = t.price * 2;
    if (bet > maxBet) {
      await interaction.reply({ content: `Max bet for a ${t.label} is **${maxBet}** ${sym} (2× its price).`, ephemeral: true });
      return;
    }
    if (animal.energy <= 0) {
      await interaction.reply({ content: `${label(animal)} is exhausted. Feed it first with \`/animal feed\`.`, ephemeral: true });
      return;
    }
    const key = `${guildId}:${userId}`;
    if (Date.now() - (raceCooldown.get(key) ?? 0) < RACE_COOLDOWN_MS) {
      await interaction.reply({ content: "Let the dust settle — one race at a time.", ephemeral: true });
      return;
    }
    raceCooldown.set(key, Date.now());
    const taken = await takeWallet(db, guildId, userId, bet);
    if (!taken) {
      await interaction.reply({ content: `You don't have **${bet}** ${sym} to bet. Check /eco balance.`, ephemeral: true });
      return;
    }

    const field = [
      { name: label(animal), mine: true, score: performance({ type: animal.type as AnimalType, age: animal.age, health: animal.health, energy: animal.energy, experience: animal.experience }) },
      ...[0, 1, 2].map((i) => ({ name: `${t.emoji} ${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]!}`, mine: false, score: performance(botOpponent(animal.type as AnimalType)) })),
    ].sort((a, b) => b.score - a.score);
    const place = field.findIndex((r) => r.mine) + 1;
    const payout = place === 1 ? bet * 2 : place === 2 ? bet : 0;
    const wallet = await addWallet(db, guildId, userId, payout);
    const { retired } = await applyRace(db, animal, place === 1);
    const medals = ["🥇", "🥈", "🥉", "4️⃣"];
    const order = field.map((r, i) => `${medals[i]} ${r.mine ? `**${r.name}**` : r.name}`).join("\n");
    const net = payout - bet;
    const desc = `${order}\n\nYou finished **${ordinal(place)}** — ${net >= 0 ? `**+${net}**` : `**${net}**`} ${sym}${retired ? `\n\n🏆 ${label(animal)} raced its last and retired a legend.` : ""}`;
    await interaction.reply({
      embeds: [ecoEmbed({ user: interaction.user, tone: place === 1 ? "win" : place === 2 ? "info" : "loss", title: "🏁 Race!", desc, footer: `Wallet: ${wallet}` })],
    });
  },
};
