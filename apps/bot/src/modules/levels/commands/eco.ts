import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { getProfile } from "../../../lib/profiles.js";
import { addWallet, claimTimed, takeWallet, topWallet } from "../../../lib/xp.js";

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
      const amount = 150 + Math.floor(Math.random() * 100);
      const wallet = await claimTimed(db, guildId, interaction.user.id, "lastDailyAt", 20, amount);
      if (wallet === null) {
        await interaction.reply({ content: "Daily already claimed. Come back later.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: `Daily claimed: **+${amount}** coins (now **${wallet}**).` });
      return;
    }

    if (sub === "work") {
      const amount = 40 + Math.floor(Math.random() * 80);
      const wallet = await claimTimed(db, guildId, interaction.user.id, "lastWorkAt", 1, amount);
      if (wallet === null) {
        await interaction.reply({ content: "You just worked. Wait a bit.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: `You worked and earned **${amount}** coins (now **${wallet}**).` });
      return;
    }

    if (sub === "pay") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      if (user.id === interaction.user.id) {
        await interaction.reply({ content: "You already have those coins.", ephemeral: true });
        return;
      }
      if (user.bot) {
        await interaction.reply({ content: "Bots don't take coins.", ephemeral: true });
        return;
      }
      // the coins leave the sender only if they are all there (checked and taken in one statement)
      if (!(await takeWallet(db, guildId, interaction.user.id, amount))) {
        await interaction.reply({ content: "Not enough coins.", ephemeral: true });
        return;
      }
      await addWallet(db, guildId, user.id, amount);
      await interaction.reply({ content: `Paid ${user} **${amount}** coins.`, allowedMentions: { users: [user.id] } });
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
