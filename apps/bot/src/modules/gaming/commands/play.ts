import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { fetchJson } from "../../../lib/feeds/http.js";

const EIGHTBALL = [
  "Yes, definitely.",
  "It's looking good.",
  "Most likely.",
  "Sure, why not.",
  "Ask again later.",
  "Can't say right now.",
  "Hmm, hard to tell.",
  "I wouldn't count on it.",
  "Probably not.",
  "No chance.",
  "Absolutely not.",
  "The signs point to yes.",
];

const JOKES = [
  "I told my computer I needed a break, and now it won't stop sending me KitKat ads.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "My wifi stopped working for two minutes, so I had to talk to my family. Nice people.",
  "I would tell you a UDP joke, but you might not get it.",
  "Parallel lines have so much in common. Shame they'll never meet.",
  "I used to play piano by ear. Now I use my hands.",
  "My password is 'incorrect', so whenever I forget it the screen reminds me: your password is incorrect.",
  "I asked the gym if they did discounts. They said it was a bit of a stretch.",
];

export const lfgCommand: KnoxCommand = {
  moduleId: "gaming",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("lfg")
    .setDescription("Post that you need players for a game")
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
    .addSubcommand((s) => s.setName("trivia").setDescription("Random trivia question"))
    .addSubcommand((s) => s.setName("8ball").setDescription("Ask the magic 8-ball").addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true).setMaxLength(300)))
    .addSubcommand((s) => s.setName("dice").setDescription("Roll dice like 2d6").addStringOption((o) => o.setName("dice").setDescription("e.g. 2d6, d20 (default 1d6)")))
    .addSubcommand((s) => s.setName("roll").setDescription("Random number").addIntegerOption((o) => o.setName("max").setDescription("Highest number (default 100)").setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((s) =>
      s
        .setName("ship")
        .setDescription("Ship two people")
        .addUserOption((o) => o.setName("first").setDescription("First person").setRequired(true))
        .addUserOption((o) => o.setName("second").setDescription("Second person")),
    )
    .addSubcommand((s) => s.setName("meme").setDescription("A fresh meme"))
    .addSubcommand((s) => s.setName("joke").setDescription("A quick joke")),
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
    if (sub === "8ball") {
      const question = interaction.options.getString("question", true);
      const answer = EIGHTBALL[Math.floor(Math.random() * EIGHTBALL.length)]!;
      await interaction.reply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle("🎱 Magic 8-ball").addFields({ name: "Question", value: question.slice(0, 256) }, { name: "Answer", value: answer })] });
      return;
    }
    if (sub === "dice") {
      const spec = (interaction.options.getString("dice") ?? "1d6").toLowerCase().replace(/\s/g, "");
      const m = spec.match(/^(\d{0,2})d(\d{1,3})$/);
      if (!m) {
        await interaction.reply({ content: "Use a form like `2d6` or `d20`.", ephemeral: true });
        return;
      }
      const n = Math.min(20, Math.max(1, parseInt(m[1] || "1", 10)));
      const sides = Math.min(1000, Math.max(2, parseInt(m[2]!, 10)));
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      await interaction.reply({ content: `🎲 ${n}d${sides}: ${rolls.map((r) => `\`${r}\``).join(" ")}${n > 1 ? ` = **${total}**` : ""}` });
      return;
    }
    if (sub === "roll") {
      const max = interaction.options.getInteger("max") ?? 100;
      await interaction.reply({ content: `🎲 You rolled **${1 + Math.floor(Math.random() * max)}** (1–${max}).` });
      return;
    }
    if (sub === "ship") {
      const a = interaction.options.getUser("first", true);
      const b = interaction.options.getUser("second") ?? interaction.user;
      // a stable score per pair so the same two always get the same number
      const seed = [a.id, b.id].sort().join("");
      let h = 0;
      for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 101;
      const bars = Math.round(h / 10);
      const bar = "💗".repeat(bars) + "🤍".repeat(10 - bars);
      const verdict = h >= 80 ? "a match made in heaven 😍" : h >= 50 ? "there's something here 👀" : h >= 20 ? "could work with effort 🤔" : "just friends 🙃";
      await interaction.reply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle("💘 Ship").setDescription(`**${a.username}** 💞 **${b.username}**\n\n${bar} **${h}%**\n${verdict}`)], allowedMentions: { parse: [] } });
      return;
    }
    if (sub === "joke") {
      await interaction.reply({ content: JOKES[Math.floor(Math.random() * JOKES.length)]! });
      return;
    }
    if (sub === "meme") {
      await interaction.deferReply();
      try {
        const res = await fetchJson<{ url?: string; title?: string; postLink?: string; nsfw?: boolean }>("https://meme-api.com/gimme", { timeoutMs: 8000 });
        if (!res.url || res.nsfw) {
          await interaction.editReply("Couldn't grab a clean meme just now, try again.");
          return;
        }
        await interaction.editReply({ embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle((res.title ?? "Meme").slice(0, 256)).setImage(res.url).setURL(res.postLink ?? null)] });
      } catch {
        await interaction.editReply("Meme service is down right now, try again in a bit.");
      }
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
      content: `You: **${pick}** · ZARU: **${bot}** · ${draw ? "Draw" : win ? "You win" : "ZARU wins"}`,
    });
  },
};
