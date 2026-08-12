import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const lfgCommand: KnoxCommand = {
  moduleId: "gaming",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("lfg")
    .setDescription("Looking for group")
    .addStringOption((o) => o.setName("game").setRequired(true).setDescription("Game"))
    .addStringOption((o) => o.setName("note").setRequired(false).setDescription("Rank / mode / extra"))
    .addIntegerOption((o) =>
      o.setName("players").setDescription("How many you need").setMinValue(1).setMaxValue(10),
    ),
  async execute(interaction, ctx) {
    const game = interaction.options.getString("game", true);
    const note = interaction.options.getString("note");
    const players = interaction.options.getInteger("players") ?? 1;
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("LFG")
          .setDescription(
            `${interaction.user} is looking for **${players}** for **${game}**${note ? `\n${note}` : ""}`,
          ),
      ],
    });
  },
};

const TRIVIA = [
  { q: "What year did Discord launch?", a: "2015" },
  { q: "How many squares on a chessboard?", a: "64" },
  { q: "What is the chemical symbol for gold?", a: "au" },
];

export const funCommand: KnoxCommand = {
  moduleId: "gaming",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("fun")
    .setDescription("Quick games")
    .addSubcommand((s) =>
      s
        .setName("rps")
        .setDescription("Rock paper scissors")
        .addStringOption((o) =>
          o
            .setName("pick")
            .setRequired(true)
            .setDescription("Your move")
            .addChoices(
              { name: "Rock", value: "rock" },
              { name: "Paper", value: "paper" },
              { name: "Scissors", value: "scissors" },
            ),
        ),
    )
    .addSubcommand((s) => s.setName("coinflip").setDescription("Heads or tails"))
    .addSubcommand((s) => s.setName("trivia").setDescription("Random trivia question")),
  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();
    if (sub === "coinflip") {
      await interaction.reply({ content: Math.random() < 0.5 ? "Heads" : "Tails" });
      return;
    }
    if (sub === "trivia") {
      const item = TRIVIA[Math.floor(Math.random() * TRIVIA.length)]!;
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Trivia")
            .setDescription(item.q)
            .setFooter({ text: `Answer: ${item.a}` }),
        ],
      });
      return;
    }
    const pick = interaction.options.getString("pick", true);
    const bot = (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]!;
    const win =
      (pick === "rock" && bot === "scissors") ||
      (pick === "paper" && bot === "rock") ||
      (pick === "scissors" && bot === "paper");
    const draw = pick === bot;
    await interaction.reply({
      content: `You: **${pick}** · Knox: **${bot}** · ${draw ? "Draw" : win ? "You win" : "Knox wins"}`,
    });
  },
};
