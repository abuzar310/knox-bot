// A coin shop: admins list items (a role, or just a badge), members buy them with their wallet.
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, asc, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { shopInventory, shopItems, shopPurchases } from "@knox/db";
import { hasMinRank } from "@knox/shared";
import type { KnoxCommand } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { ecoEmbed } from "../../../lib/economy-ui.js";
import { resolveKnoxRank } from "../../../permissions/resolve.js";
import { canGrantRole, roleIdGrantProblem } from "../../../lib/roles.js";
import { activateRobShield, activateXpBoost, addWallet, takeWallet } from "../../../lib/xp.js";

const ITEM_TYPES = [
  { name: "Role (gives a role)", value: "role" },
  { name: "Badge (cosmetic, no effect)", value: "badge" },
  { name: "Rob shield (blocks robberies)", value: "shield" },
  { name: "XP boost (more XP for a while)", value: "xpboost" },
  { name: "Lootbox (random coins when used)", value: "lootbox" },
] as const;
const USABLE = new Set(["shield", "xpboost", "lootbox"]);
const effectLabel = (type: string, effect: number) => (type === "shield" ? `${effect}h protection` : type === "xpboost" ? `+${effect}% XP for 1h` : type === "lootbox" ? `up to ${effect} coins` : "");

const MAX_ITEMS = 25;

async function isShopAdmin(interaction: Parameters<KnoxCommand["execute"]>[0], client: KnoxClient) {
  const guild = interaction.guild;
  if (!guild) return false;
  const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const cached = await client.guildConfig.get(guild.id);
  return hasMinRank(resolveKnoxRank(member, cached.permissionRows), "admin");
}

export const shopCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Spend coins on roles and badges")
    .addSubcommand((s) => s.setName("list").setDescription("What's for sale"))
    .addSubcommand((s) =>
      s
        .setName("buy")
        .setDescription("Buy an item")
        .addStringOption((o) => o.setName("item").setDescription("Item name (from /shop list)").setRequired(true).setMaxLength(40)),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Staff: put an item up for sale")
        .addStringOption((o) => o.setName("name").setDescription("Item name").setRequired(true).setMaxLength(40))
        .addIntegerOption((o) => o.setName("price").setDescription("Coins").setRequired(true).setMinValue(1).setMaxValue(1_000_000))
        .addStringOption((o) => o.setName("type").setDescription("What the item does (default: role if you pick a role, else badge)").addChoices(...ITEM_TYPES))
        .addIntegerOption((o) => o.setName("effect").setDescription("Shield: hours · XP boost: percent · Lootbox: max coins").setMinValue(1).setMaxValue(1_000_000))
        .addRoleOption((o) => o.setName("role").setDescription("Role the buyer gets (for a role item)"))
        .addStringOption((o) => o.setName("description").setDescription("One line about it").setMaxLength(100))
        .addIntegerOption((o) => o.setName("stock").setDescription("How many can be sold (leave empty for unlimited)").setMinValue(1).setMaxValue(100_000)),
    )
    .addSubcommand((s) =>
      s
        .setName("use")
        .setDescription("Use an item from your inventory (shield, XP boost, lootbox)")
        .addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true).setMaxLength(40)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Staff: take an item off sale")
        .addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true).setMaxLength(40)),
    )
    .addSubcommand((s) =>
      s
        .setName("inventory")
        .setDescription("Things bought in the shop")
        .addUserOption((o) => o.setName("user").setDescription("Whose inventory")),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    if (ctx.settings && !ctx.settings.features.economyEnabled) {
      await interaction.reply({ content: "Economy is off here.", ephemeral: true });
      return;
    }
    const client = ctx.client;
    const db = client.db;
    const sub = interaction.options.getSubcommand();
    const color = ctx.settings?.embedColor;

    if (sub === "inventory") {
      const user = interaction.options.getUser("user") ?? interaction.user;
      const owned = await db
        .select()
        .from(shopInventory)
        .where(and(eq(shopInventory.guildId, guild.id), eq(shopInventory.userId, user.id), gt(shopInventory.qty, 0)))
        .orderBy(asc(shopInventory.name));
      const rows = await db
        .select()
        .from(shopPurchases)
        .where(and(eq(shopPurchases.guildId, guild.id), eq(shopPurchases.userId, user.id)))
        .orderBy(desc(shopPurchases.createdAt))
        .limit(15);
      const usableBlock = owned.length ? `**Usable items** (/shop use)\n${owned.map((o) => `• **${o.name}** ×${o.qty} — ${effectLabel(o.type, o.effect)}`).join("\n")}` : "";
      const historyBlock = rows.length ? `**Bought**\n${rows.map((r) => `• ${r.itemName} · ${r.price} coins`).join("\n")}` : "";
      const body = [usableBlock, historyBlock].filter(Boolean).join("\n\n") || "Nothing yet. See /shop list.";
      await interaction.reply({ embeds: [knoxEmbed(color).setTitle(`${user.username}'s inventory`).setDescription(body.slice(0, 4000))] });
      return;
    }

    if (sub === "list") {
      const items = await db.select().from(shopItems).where(eq(shopItems.guildId, guild.id)).orderBy(asc(shopItems.price));
      if (!items.length) {
        await interaction.reply({ content: "The shop is empty. Staff can stock it with /shop add.", ephemeral: true });
        return;
      }
      const lines = items.map(
        (i) =>
          `**${i.name}** · ${i.price} coins${i.roleId ? ` · <@&${i.roleId}>` : " · badge"}${i.stock !== null ? ` · ${i.stock} left` : ""}${i.description ? `\n> ${i.description}` : ""}`,
      );
      await interaction.reply({ embeds: [knoxEmbed(color).setTitle(`${guild.name} shop`).setDescription(lines.join("\n")).setFooter({ text: "/shop buy item:<name>" })] });
      return;
    }

    if (sub === "add" || sub === "remove") {
      if (!(await isShopAdmin(interaction, client))) {
        await interaction.reply({ content: "Only staff can change the shop.", ephemeral: true });
        return;
      }
      const name = interaction.options.getString(sub === "add" ? "name" : "item", true).trim().toLowerCase();
      if (sub === "remove") {
        const removed = await db.delete(shopItems).where(and(eq(shopItems.guildId, guild.id), eq(shopItems.name, name))).returning({ id: shopItems.id });
        await interaction.reply({ content: removed.length ? `**${name}** is off sale.` : `No item called **${name}**.`, ephemeral: true });
        return;
      }
      if (!/^[\p{L}\p{N}][\p{L}\p{N} '._-]{1,39}$/u.test(name)) {
        await interaction.reply({ content: "Item names use letters, digits and spaces (2–40 characters).", ephemeral: true });
        return;
      }
      const role = interaction.options.getRole("role");
      if (role) {
        const problem = await roleIdGrantProblem(guild, role.id);
        if (problem) {
          await interaction.reply({ content: `That role can't be sold: ${problem}.`, ephemeral: true });
          return;
        }
      }
      const type = interaction.options.getString("type") ?? (role ? "role" : "badge");
      const effect = interaction.options.getInteger("effect") ?? 0;
      if (type === "role" && !role) {
        await interaction.reply({ content: "A role item needs a role. Pick one, or choose a different type.", ephemeral: true });
        return;
      }
      if (USABLE.has(type) && effect <= 0) {
        await interaction.reply({ content: `A ${type} item needs an **effect** value (${type === "shield" ? "hours of protection" : type === "xpboost" ? "XP percent" : "max coins"}).`, ephemeral: true });
        return;
      }
      const [existing] = await db.select({ n: count() }).from(shopItems).where(eq(shopItems.guildId, guild.id));
      if ((existing?.n ?? 0) >= MAX_ITEMS) {
        await interaction.reply({ content: `The shop holds ${MAX_ITEMS} items at most; remove one first.`, ephemeral: true });
        return;
      }
      const price = interaction.options.getInteger("price", true);
      const [item] = await db
        .insert(shopItems)
        .values({
          guildId: guild.id,
          name,
          price,
          roleId: type === "role" ? role?.id ?? null : null,
          type,
          effect,
          description: interaction.options.getString("description")?.trim() || null,
          stock: interaction.options.getInteger("stock"),
          createdBy: interaction.user.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!item) {
        await interaction.reply({ content: `**${name}** is already for sale; remove it first to change it.`, ephemeral: true });
        return;
      }
      const what = type === "role" ? `gives <@&${role!.id}>` : USABLE.has(type) ? effectLabel(type, effect) : "a badge";
      await interaction.reply({ content: `**${item.name}** is for sale at **${item.price}** coins · ${what}${item.stock !== null ? ` (${item.stock} in stock)` : ""}.`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }

    if (sub === "use") {
      const uname = interaction.options.getString("item", true).trim().toLowerCase();
      const [owned] = await db.select().from(shopInventory).where(and(eq(shopInventory.guildId, guild.id), eq(shopInventory.userId, interaction.user.id), eq(shopInventory.name, uname))).limit(1);
      if (!owned || owned.qty <= 0) {
        await interaction.reply({ content: `You don't own **${uname}**. Buy it with /shop buy, see yours with /shop inventory.`, ephemeral: true });
        return;
      }
      // consume one first so a slow effect can't be double-used
      const [left] = await db
        .update(shopInventory)
        .set({ qty: sql`${shopInventory.qty} - 1` })
        .where(and(eq(shopInventory.id, owned.id), gt(shopInventory.qty, 0)))
        .returning({ qty: shopInventory.qty });
      if (!left) {
        await interaction.reply({ content: `You don't own **${uname}** any more.`, ephemeral: true });
        return;
      }
      let desc: string;
      if (owned.type === "shield") {
        await activateRobShield(db, guild.id, interaction.user.id, owned.effect);
        desc = `🛡️ **Rob shield** on — your wallet is safe from robbers for **${owned.effect}h**.`;
      } else if (owned.type === "xpboost") {
        await activateXpBoost(db, guild.id, interaction.user.id, owned.effect, 1);
        desc = `⚡ **XP boost** on — **+${owned.effect}%** XP for the next hour.`;
      } else {
        const win = 1 + Math.floor(Math.random() * Math.max(1, owned.effect));
        const wallet = await addWallet(db, guild.id, interaction.user.id, win);
        desc = `🎁 You opened **${owned.name}** and found **${win}** coins! (wallet **${wallet}**)`;
      }
      await interaction.reply({ embeds: [ecoEmbed({ user: interaction.user, tone: owned.type === "lootbox" ? "win" : "gain", desc, footer: `${left.qty} ${owned.name} left` })] });
      return;
    }

    // buy
    const name = interaction.options.getString("item", true).trim().toLowerCase();
    const [item] = await db.select().from(shopItems).where(and(eq(shopItems.guildId, guild.id), eq(shopItems.name, name))).limit(1);
    if (!item) {
      await interaction.reply({ content: `No item called **${name}**. See /shop list.`, ephemeral: true });
      return;
    }
    const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) return;
    if (item.roleId && member.roles.cache.has(item.roleId)) {
      await interaction.reply({ content: `You already have <@&${item.roleId}>.`, ephemeral: true, allowedMentions: { parse: [] } });
      return;
    }
    const role = item.roleId ? guild.roles.cache.get(item.roleId) : null;
    if (item.roleId && !canGrantRole(role)) {
      await interaction.reply({ content: "That item's role can't be given out right now; tell the staff.", ephemeral: true });
      return;
    }
    // stock first (one unit reserved), then coins, then the role; anything that fails puts the earlier steps back
    const reserved = await db
      .update(shopItems)
      .set({ stock: sql`case when ${shopItems.stock} is null then null else ${shopItems.stock} - 1 end` })
      .where(and(eq(shopItems.id, item.id), or(isNull(shopItems.stock), gt(shopItems.stock, 0))))
      .returning({ id: shopItems.id });
    if (!reserved.length) {
      await interaction.reply({ content: `**${item.name}** is sold out.`, ephemeral: true });
      return;
    }
    const paid = await takeWallet(db, guild.id, interaction.user.id, item.price);
    if (!paid) {
      if (item.stock !== null) await db.update(shopItems).set({ stock: sql`${shopItems.stock} + 1` }).where(eq(shopItems.id, item.id));
      await interaction.reply({ content: `You need **${item.price}** coins for that. Check /eco balance.`, ephemeral: true });
      return;
    }
    if (role) {
      const granted = await member.roles.add(role, `Bought "${item.name}" for ${item.price} coins`).then(() => true, () => false);
      if (!granted) {
        await addWallet(db, guild.id, interaction.user.id, item.price);
        if (item.stock !== null) await db.update(shopItems).set({ stock: sql`${shopItems.stock} + 1` }).where(eq(shopItems.id, item.id));
        await interaction.reply({ content: "I couldn't give you the role, so your coins were returned. Tell the staff.", ephemeral: true });
        return;
      }
    }
    // usable items go into the member's inventory to /shop use later
    if (USABLE.has(item.type)) {
      await db
        .insert(shopInventory)
        .values({ guildId: guild.id, userId: interaction.user.id, name: item.name, type: item.type, effect: item.effect, qty: 1 })
        .onConflictDoUpdate({ target: [shopInventory.guildId, shopInventory.userId, shopInventory.name], set: { qty: sql`${shopInventory.qty} + 1`, type: item.type, effect: item.effect } });
    }
    await db.insert(shopPurchases).values({ guildId: guild.id, userId: interaction.user.id, itemId: item.id, itemName: item.name, price: item.price });
    const gotLine = role ? ` and got <@&${role.id}>` : USABLE.has(item.type) ? ` — **/shop use ${item.name}** to use it (${effectLabel(item.type, item.effect)})` : "";
    await interaction.reply({
      embeds: [ecoEmbed({ user: interaction.user, tone: "info", title: "🛒 Purchased", desc: `Bought **${item.name}** for **${item.price}** coins${gotLine}.` })],
      allowedMentions: { users: [interaction.user.id] },
    });
  },
};

