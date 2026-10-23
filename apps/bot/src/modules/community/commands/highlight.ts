// /highlight: the words a member wants a DM about.
import { SlashCommandBuilder } from "discord.js";
import { and, asc, count, eq } from "drizzle-orm";
import { highlights } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { MAX_WORDS, WORD_RE, cacheWord, normalizeWord, uncacheWord } from "../lib/highlights.js";

export const highlightCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("highlight")
    .setDescription("Get a DM when someone says a word you care about")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a word or short phrase")
        .addStringOption((o) => o.setName("word").setDescription("e.g. valorant, free game, your name").setRequired(true).setMaxLength(50)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a word")
        .addStringOption((o) => o.setName("word").setDescription("The word to drop").setRequired(true).setMaxLength(50)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Your words in this server"))
    .addSubcommand((s) => s.setName("clear").setDescription("Remove all your words here")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const client = ctx.client;
    const sub = interaction.options.getSubcommand();
    const mine = and(eq(highlights.guildId, guild.id), eq(highlights.userId, interaction.user.id));

    if (sub === "list") {
      const rows = await client.db.select({ word: highlights.word }).from(highlights).where(mine).orderBy(asc(highlights.word));
      await interaction.reply({
        content: rows.length
          ? `Your highlights here (${rows.length}/${MAX_WORDS}): ${rows.map((r) => `\`${r.word}\``).join(", ")}\nYou're DMed when one is said in a channel you can see, at most once every 5 minutes, never for channels you were just active in.`
          : "You have no highlights in this server. Try /highlight add.",
        ephemeral: true,
      });
      return;
    }
    if (sub === "clear") {
      await client.db.delete(highlights).where(mine);
      uncacheWord(client, guild.id, interaction.user.id, null);
      await interaction.reply({ content: "All your highlights here are gone.", ephemeral: true });
      return;
    }
    const word = normalizeWord(interaction.options.getString("word", true));
    if (sub === "remove") {
      const removed = await client.db.delete(highlights).where(and(mine, eq(highlights.word, word))).returning({ word: highlights.word });
      uncacheWord(client, guild.id, interaction.user.id, word);
      await interaction.reply({ content: removed.length ? `Removed \`${word}\`.` : `\`${word}\` wasn't on your list.`, ephemeral: true });
      return;
    }
    if (!WORD_RE.test(word)) {
      await interaction.reply({ content: "Use 2–50 letters, digits or spaces (no symbols).", ephemeral: true });
      return;
    }
    const [existing] = await client.db.select({ n: count() }).from(highlights).where(mine);
    if ((existing?.n ?? 0) >= MAX_WORDS) {
      await interaction.reply({ content: `You already have ${MAX_WORDS} highlights here; remove one first.`, ephemeral: true });
      return;
    }
    await client.db.insert(highlights).values({ guildId: guild.id, userId: interaction.user.id, word }).onConflictDoNothing();
    cacheWord(client, guild.id, interaction.user.id, word);
    await interaction.reply({ content: `You'll get a DM when someone says \`${word}\` here. Keep your DMs open for ZARU.`, ephemeral: true });
  },
};
