// Server coins, Dank-Memer style: earn with daily/work/fish/hunt/crime, rob other people's WALLETS (bank is safe),
// and park coins in the bank with deposit/withdraw. Every money move is a single guarded UPDATE, so no race prints coins.
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { guildIncomeRoles } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { getProfile } from "../../../lib/profiles.js";
import { addWallet, claimTimed, depositCoins, takeWallet, topWallet, tryCooldown, withdrawCoins } from "../../../lib/xp.js";

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

const FISH_WINS = ["a fat rohu 🐟", "a shiny pomfret 🐠", "a catfish 🐡", "a crab that pinched you first 🦀", "a confused frog 🐸"];
const FISH_RARE = ["a golden mahseer ✨🐟", "a giant squid 🦑", "a pearl oyster 🦪"];
const FISH_NONE = ["the line came back empty", "an old boot 🥾 (worthless)", "some plastic. clean the river, yaar", "a Jio recharge coupon from 2019 (expired)"];
const HUNT_WINS = ["a rabbit 🐇", "a wild boar 🐗", "a deer 🦌", "a chicken that escaped someone's farm 🐔"];
const HUNT_RARE = ["a trophy tiger… photo 📸🐅 (sold to a magazine)", "a rare black buck 🦌✨"];
const HUNT_NONE = ["nothing — the jungle was silent", "a mosquito bite, that's all 🦟", "you stepped on a twig and scared everything away"];
const CRIME_WINS = ["pickpocketed a tourist", "sold 'VIP' giveaway slots", "scalped concert tickets", "ran a fake tech-support call for one hour", "resold the office stapler"];
const CRIME_FAIL = ["the uncle next door caught you and called your mom", "CCTV saw everything", "the police did a lathi charge", "your partner snitched"];

export const ecoCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("eco")
    .setDescription("Server coins: earn, rob, bank")
    .addSubcommand((s) => s.setName("balance").setDescription("Wallet and bank").addUserOption((o) => o.setName("user").setDescription("Whose").setRequired(false)))
    .addSubcommand((s) => s.setName("daily").setDescription("Claim daily coins"))
    .addSubcommand((s) => s.setName("work").setDescription("Work for coins (hourly)"))
    .addSubcommand((s) => s.setName("fish").setDescription("Cast a line (every 5 min)"))
    .addSubcommand((s) => s.setName("hunt").setDescription("Go hunting (every 8 min)"))
    .addSubcommand((s) => s.setName("crime").setDescription("Risky money (every 20 min; you can lose)"))
    .addSubcommand((s) =>
      s
        .setName("rob")
        .setDescription("Rob someone's wallet (hourly; their bank is safe, and you pay if caught)")
        .addUserOption((o) => o.setName("user").setDescription("Who to rob").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("deposit").setDescription("Wallet → bank (safe from robbers)").addIntegerOption((o) => o.setName("amount").setDescription("Coins (empty = all)").setMinValue(1)))
    .addSubcommand((s) => s.setName("withdraw").setDescription("Bank → wallet").addIntegerOption((o) => o.setName("amount").setDescription("Coins (empty = all)").setMinValue(1)))
    .addSubcommand((s) =>
      s
        .setName("pay")
        .setDescription("Pay another member")
        .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Member"))
        .addIntegerOption((o) => o.setName("amount").setRequired(true).setDescription("Coins").setMinValue(1)),
    )
    .addSubcommand((s) => s.setName("top").setDescription("Richest members (wallet + bank)"))
    .addSubcommand((s) => s.setName("collect").setDescription("Collect your role salaries (once a day)"))
    .addSubcommandGroup((g) =>
      g
        .setName("salary")
        .setDescription("Role salaries, collected daily with /eco collect (admin)")
        .addSubcommand((s) =>
          s
            .setName("set")
            .setDescription("Members with this role collect this much per day")
            .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
            .addIntegerOption((o) => o.setName("amount").setDescription("Per day").setRequired(true).setMinValue(1).setMaxValue(1_000_000)),
        )
        .addSubcommand((s) => s.setName("remove").setDescription("Stop a role's salary").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
        .addSubcommand((s) => s.setName("list").setDescription("All role salaries")),
    )
    .addSubcommand((s) =>
      s
        .setName("config")
        .setDescription("Tune the economy: currency name/symbol and payout ranges (admin)")
        .addStringOption((o) => o.setName("currency_name").setDescription('e.g. "rupees"').setMaxLength(30))
        .addStringOption((o) => o.setName("currency_symbol").setDescription("e.g. ₹ or 💎").setMaxLength(8))
        .addIntegerOption((o) => o.setName("work_min").setDescription("Lowest /eco work payout").setMinValue(1))
        .addIntegerOption((o) => o.setName("work_max").setDescription("Highest /eco work payout").setMinValue(1))
        .addIntegerOption((o) => o.setName("daily_min").setDescription("Lowest /eco daily payout").setMinValue(1))
        .addIntegerOption((o) => o.setName("daily_max").setDescription("Highest /eco daily payout").setMinValue(1))
        .addIntegerOption((o) => o.setName("crime_min").setDescription("Lowest crime win").setMinValue(1))
        .addIntegerOption((o) => o.setName("crime_max").setDescription("Highest crime win").setMinValue(1)),
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
    const me = interaction.user.id;
    const f = ctx.settings?.features;
    const sym = f?.currencySymbol ?? "🪙";
    const cur = `${sym} ${f?.currencyName ?? "coins"}`;
    const span = (lo: number, hi: number) => between(Math.min(lo, hi), Math.max(lo, hi));

    if (interaction.options.getSubcommandGroup(false) === "salary" || sub === "config") {
      const member = await interaction.guild.members.fetch(me);
      if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && me !== interaction.guild.ownerId) {
        await interaction.reply({ content: "Manage Server is needed for that.", ephemeral: true });
        return;
      }
      if (sub === "set") {
        const role = interaction.options.getRole("role", true);
        const amount = interaction.options.getInteger("amount", true);
        await db
          .insert(guildIncomeRoles)
          .values({ guildId, roleId: role.id, amount })
          .onConflictDoUpdate({ target: [guildIncomeRoles.guildId, guildIncomeRoles.roleId], set: { amount } });
        await interaction.reply({ content: `💼 Members with ${role} now collect **${amount}** ${cur} a day with \`/eco collect\`.`, allowedMentions: { parse: [] } });
        return;
      }
      if (sub === "remove") {
        const role = interaction.options.getRole("role", true);
        const gone = await db.delete(guildIncomeRoles).where(and(eq(guildIncomeRoles.guildId, guildId), eq(guildIncomeRoles.roleId, role.id))).returning({ id: guildIncomeRoles.id });
        await interaction.reply({ content: gone.length ? `Salary removed from ${role}.` : `${role} had no salary.`, allowedMentions: { parse: [] } });
        return;
      }
      if (sub === "list") {
        const rows = await db.select().from(guildIncomeRoles).where(eq(guildIncomeRoles.guildId, guildId));
        await interaction.reply({
          embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle("Role salaries").setDescription(rows.length ? rows.map((r) => `<@&${r.roleId}> — **${r.amount}**/day`).join("\n") : "None yet: /eco salary set.")],
          allowedMentions: { parse: [] },
        });
        return;
      }
      // config
      if (!ctx.settings) return;
      const next = { ...ctx.settings.features };
      const str = (name: string) => interaction.options.getString(name)?.trim();
      const int = (name: string) => interaction.options.getInteger(name);
      next.currencyName = str("currency_name") || next.currencyName;
      next.currencySymbol = str("currency_symbol") || next.currencySymbol;
      next.workMin = int("work_min") ?? next.workMin;
      next.workMax = int("work_max") ?? next.workMax;
      next.dailyMin = int("daily_min") ?? next.dailyMin;
      next.dailyMax = int("daily_max") ?? next.dailyMax;
      next.crimeMin = int("crime_min") ?? next.crimeMin;
      next.crimeMax = int("crime_max") ?? next.crimeMax;
      await persistGuildSettings(ctx.client, guildId, { ...ctx.settings, features: next });
      await interaction.reply({
        content: `Economy tuned: currency **${next.currencySymbol} ${next.currencyName}**, work ${next.workMin}–${next.workMax}, daily ${next.dailyMin}–${next.dailyMax}, crime ${next.crimeMin}–${next.crimeMax}.`,
      });
      return;
    }

    if (sub === "collect") {
      const member = await interaction.guild.members.fetch(me);
      const rows = await db.select().from(guildIncomeRoles).where(eq(guildIncomeRoles.guildId, guildId));
      const mine = rows.filter((r) => member.roles.cache.has(r.roleId));
      if (!mine.length) {
        await interaction.reply({ content: rows.length ? "None of your roles pay a salary." : "This server has no role salaries yet (/eco salary set).", ephemeral: true });
        return;
      }
      if (!(await tryCooldown(db, guildId, me, "lastCollectAt", 20 * 60))) {
        await interaction.reply({ content: "Salary already collected. Come back tomorrow.", ephemeral: true });
        return;
      }
      const total = mine.reduce((sum, r) => sum + r.amount, 0);
      const wallet = await addWallet(db, guildId, me, total);
      await interaction.reply({
        content: `💼 Collected **${total}** ${cur} from ${mine.map((r) => `<@&${r.roleId}>`).join(", ")} (wallet **${wallet}**).`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === "balance") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const profile = await getProfile(db, guildId, user.id);
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle(cur)
            .setDescription(`${user}\n👛 Wallet: **${profile.wallet}** ${sym}\n🏦 Bank: **${profile.bank}** ${sym}\n📈 Total: **${profile.wallet + profile.bank}** ${sym}`),
        ],
      });
      return;
    }

    if (sub === "daily") {
      const amount = span(f?.dailyMin ?? 150, f?.dailyMax ?? 250);
      const wallet = await claimTimed(db, guildId, me, "lastDailyAt", 20, amount);
      if (wallet === null) {
        await interaction.reply({ content: "Daily already claimed. Come back later.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: `Daily claimed: **+${amount}** ${cur} (wallet **${wallet}**).` });
      return;
    }

    if (sub === "work") {
      const amount = span(f?.workMin ?? 40, f?.workMax ?? 120);
      const wallet = await claimTimed(db, guildId, me, "lastWorkAt", 1, amount);
      if (wallet === null) {
        await interaction.reply({ content: "You just worked. Wait a bit.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: `You worked and earned **${amount}** ${cur} (wallet **${wallet}**).` });
      return;
    }

    if (sub === "fish" || sub === "hunt") {
      const fish = sub === "fish";
      if (!(await tryCooldown(db, guildId, me, fish ? "lastFishAt" : "lastHuntAt", fish ? 5 : 8))) {
        await interaction.reply({ content: fish ? "The fish are suspicious. Try again in a few minutes. 🎣" : "The jungle needs a breather. Try again in a few minutes. 🏹", ephemeral: true });
        return;
      }
      const roll = Math.random();
      if (roll < 0.2) {
        await interaction.reply({ content: `${fish ? "🎣" : "🏹"} You got… ${pick(fish ? FISH_NONE : HUNT_NONE)}. **+0** coins.` });
        return;
      }
      const rare = roll >= 0.95;
      const amount = rare ? between(fish ? 300 : 350, fish ? 500 : 550) : roll >= 0.8 ? between(fish ? 120 : 150, fish ? 250 : 280) : between(fish ? 30 : 40, fish ? 90 : 110);
      const wallet = await addWallet(db, guildId, me, amount);
      const what = rare ? pick(fish ? FISH_RARE : HUNT_RARE) : pick(fish ? FISH_WINS : HUNT_WINS);
      await interaction.reply({ content: `${fish ? "🎣" : "🏹"} You caught ${what} — sold for **${amount}** coins${rare ? " ✨ RARE!" : ""} (wallet **${wallet}**).` });
      return;
    }

    if (sub === "crime") {
      if (!(await tryCooldown(db, guildId, me, "lastCrimeAt", 20))) {
        await interaction.reply({ content: "Lay low for a while — the heat is still on. 🚨", ephemeral: true });
        return;
      }
      if (Math.random() < 0.55) {
        const amount = span(f?.crimeMin ?? 100, f?.crimeMax ?? 240);
        const wallet = await addWallet(db, guildId, me, amount);
        await interaction.reply({ content: `🕶️ You ${pick(CRIME_WINS)} and made **${amount}** coins (wallet **${wallet}**).` });
      } else {
        const profile = await getProfile(db, guildId, me);
        const loss = Math.min(profile.wallet, between(60, 160));
        await addWallet(db, guildId, me, -loss);
        await interaction.reply({ content: `🚨 Caught! ${pick(CRIME_FAIL)} — you lost **${loss}** coins.` });
      }
      return;
    }

    if (sub === "rob") {
      const target = interaction.options.getUser("user", true);
      if (target.id === me || target.bot) {
        await interaction.reply({ content: target.bot ? "Bots keep their coins in the cloud." : "Robbing yourself is called checking your wallet.", ephemeral: true });
        return;
      }
      const victim = await getProfile(db, guildId, target.id);
      if (victim.wallet < 100) {
        await interaction.reply({ content: `${target} is broke (wallet under 100). Not worth the risk.`, ephemeral: true });
        return;
      }
      if (!(await tryCooldown(db, guildId, me, "lastRobAt", 60))) {
        await interaction.reply({ content: "You already tried a robbery this hour. Patience. 🥷", ephemeral: true });
        return;
      }
      if (Math.random() < 0.45) {
        const steal = Math.max(25, Math.floor(victim.wallet * (0.1 + Math.random() * 0.25)));
        const taken = await takeWallet(db, guildId, target.id, steal);
        if (!taken) {
          await interaction.reply({ content: `${target} moved their coins before you got there. Nothing stolen.` });
          return;
        }
        const wallet = await addWallet(db, guildId, me, steal);
        await interaction.reply({ content: `🥷 You robbed ${target} for **${steal}** coins! (wallet **${wallet}**) — coins in the **bank** can't be robbed.`, allowedMentions: { users: [target.id] } });
      } else {
        const robber = await getProfile(db, guildId, me);
        const fine = Math.min(robber.wallet, Math.max(50, Math.floor(robber.wallet * 0.15)));
        await addWallet(db, guildId, me, -fine);
        if (fine > 0) await addWallet(db, guildId, target.id, fine);
        await interaction.reply({ content: `🚔 Caught red-handed! You paid ${target} **${fine}** coins as compensation.`, allowedMentions: { users: [target.id] } });
      }
      return;
    }

    if (sub === "deposit" || sub === "withdraw") {
      const deposit = sub === "deposit";
      const profile = await getProfile(db, guildId, me);
      const available = deposit ? profile.wallet : profile.bank;
      const amount = interaction.options.getInteger("amount") ?? available;
      if (available <= 0 || amount <= 0) {
        await interaction.reply({ content: deposit ? "Nothing in your wallet to deposit." : "Your bank is empty.", ephemeral: true });
        return;
      }
      const result = deposit ? await depositCoins(db, guildId, me, Math.min(amount, available)) : await withdrawCoins(db, guildId, me, Math.min(amount, available));
      if (result === null) {
        await interaction.reply({ content: "Those coins aren't there any more.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: deposit ? `🏦 Deposited **${Math.min(amount, available)}** — bank now **${result}**. Robbers can't touch it.` : `👛 Withdrew **${Math.min(amount, available)}** — wallet now **${result}**.` });
      return;
    }

    if (sub === "pay") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      if (user.id === me) {
        await interaction.reply({ content: "You already have those coins.", ephemeral: true });
        return;
      }
      if (user.bot) {
        await interaction.reply({ content: "Bots don't take coins.", ephemeral: true });
        return;
      }
      // the coins leave the sender only if they are all there (checked and taken in one statement)
      if (!(await takeWallet(db, guildId, me, amount))) {
        await interaction.reply({ content: "Not enough coins in your wallet.", ephemeral: true });
        return;
      }
      await addWallet(db, guildId, user.id, amount);
      await interaction.reply({ content: `Paid ${user} **${amount}** ${cur}.`, allowedMentions: { users: [user.id] } });
      return;
    }

    const rows = await topWallet(db, guildId, 10);
    const lines = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — **${r.wallet + r.bank}** (👛 ${r.wallet} · 🏦 ${r.bank})`);
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Richest")
          .setDescription(lines.join("\n") || "Nobody has coins yet."),
      ],
    });
  },
};
