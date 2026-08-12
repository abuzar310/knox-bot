import { SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { memberProfiles } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { getProfile } from "../../../lib/profiles.js";
import { addWallet, topWallet } from "../../../lib/xp.js";

function hoursSince(date: Date | null) {
  if (!date) return 99;
  return (Date.now() - date.getTime()) / 3_600_000;
}

export const ecoCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("eco")
    .setDescription("Server coins")
    .addSubcommand((s) =>
      s.setName("balance").setDescription("Check coins").addUserOption((o) =>
        o.setName("user").setDescription("Whose wallet").setRequired(false),
      ),
    )
    .addSubcommand((s) => s.setName("daily").setDescription("Claim daily coins"))
    .addSubcommand((s) => s.setName("work").setDescription("Work for coins"))
    .addSubcommand((s) =>
      s
        .setName("pay")
        .setDescription("Pay another member")
        .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Member"))
        .addIntegerOption((o) =>
          o.setName("amount").setRequired(true).setDescription("Coins").setMinValue(1),
        ),
    )
    .addSubcommand((s) => s.setName("top").setDescription("Richest members")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    const db = ctx.client.db;
    const guildId = interaction.guild.id;

    if (sub === "balance") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const profile = await getProfile(db, guildId, user.id);
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Wallet")
            .setDescription(`${user} has **${profile.wallet}** coins.`),
        ],
      });
      return;
    }

    if (sub === "daily") {
      const profile = await getProfile(db, guildId, interaction.user.id);
      if (hoursSince(profile.lastDailyAt) < 20) {
        await interaction.reply({ content: "Daily already claimed. Come back later.", ephemeral: true });
        return;
      }
      const amount = 150 + Math.floor(Math.random() * 100);
      await db
        .update(memberProfiles)
        .set({ wallet: profile.wallet + amount, lastDailyAt: new Date() })
        .where(and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, interaction.user.id)));
      await interaction.reply({ content: `Daily claimed: **+${amount}** coins.` });
      return;
    }

    if (sub === "work") {
      const profile = await getProfile(db, guildId, interaction.user.id);
      if (hoursSince(profile.lastWorkAt) < 1) {
        await interaction.reply({ content: "You just worked. Wait a bit.", ephemeral: true });
        return;
      }
      const amount = 40 + Math.floor(Math.random() * 80);
      await db
        .update(memberProfiles)
        .set({ wallet: profile.wallet + amount, lastWorkAt: new Date() })
        .where(and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, interaction.user.id)));
      await interaction.reply({ content: `You worked and earned **${amount}** coins.` });
      return;
    }

    if (sub === "pay") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      if (user.id === interaction.user.id) {
        await interaction.reply({ content: "You already have those coins.", ephemeral: true });
        return;
      }
      const from = await getProfile(db, guildId, interaction.user.id);
      if (from.wallet < amount) {
        await interaction.reply({ content: "Not enough coins.", ephemeral: true });
        return;
      }
      await addWallet(db, guildId, interaction.user.id, -amount);
      await addWallet(db, guildId, user.id, amount);
      await interaction.reply({ content: `Paid ${user} **${amount}** coins.` });
      return;
    }

    const rows = await topWallet(db, guildId, 10);
    const lines = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — **${r.wallet}**`);
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Richest")
          .setDescription(lines.join("\n") || "Nobody has coins yet."),
      ],
    });
  },
};
