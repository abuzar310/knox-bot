// When ZARU joins, ask who is admin / mod / DJ with Discord role menus.
// Guesses from role names and permissions are pre-filled so the owner can just press Save.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type RoleSelectMenuInteraction,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { guildPermissionRoles, guilds, notifyGuildConfig } from "@knox/db";
import type { KnoxRank } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { guessRankFromRoleName } from "../permissions/resolve.js";

export const RANK_PICK_PREFIX = "knox:rank:pick:";
export const RANK_SAVE_ID = "knox:rank:save";
export const RANK_SKIP_ID = "knox:rank:skip";
export const RANK_OPEN_ID = "knox:rank:open";

const PICK_RANKS = ["admin", "mod", "dj"] as const;
export type StaffPickRank = (typeof PICK_RANKS)[number];

type Picks = { admin?: string; mod?: string; dj?: string; at: number };
const pending = new Map<string, Picks>();
const PENDING_TTL_MS = 30 * 60_000;

export type RoleHint = {
  id: string;
  name: string;
  position: number;
  managed?: boolean;
  everyone?: boolean;
  administrator?: boolean;
  manageGuild?: boolean;
  kick?: boolean;
  moderate?: boolean;
  manageMessages?: boolean;
};

export function guessStaffRolesFrom(roles: RoleHint[]): { admin?: string; mod?: string; dj?: string } {
  const sorted = roles.filter((r) => !r.everyone && !r.managed).sort((a, b) => b.position - a.position);
  const named = (want: KnoxRank) => sorted.find((r) => guessRankFromRoleName(r.name) === want);
  const admin = named("admin") ?? sorted.find((r) => r.administrator || r.manageGuild);
  const used = new Set(admin ? [admin.id] : []);
  const namedMod = named("mod");
  const mod =
    namedMod && !used.has(namedMod.id)
      ? namedMod
      : sorted.find((r) => !used.has(r.id) && (r.kick || r.moderate || r.manageMessages));
  if (mod) used.add(mod.id);
  const namedDj = named("dj");
  const dj = namedDj && !used.has(namedDj.id) ? namedDj : undefined;
  return { admin: admin?.id, mod: mod?.id, dj: dj?.id };
}

export function guessStaffRoles(guild: Guild) {
  const ids = guessStaffRolesFrom(
    [...guild.roles.cache.values()].map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      managed: r.managed,
      everyone: r.id === guild.id,
      administrator: r.permissions.has(PermissionFlagsBits.Administrator),
      manageGuild: r.permissions.has(PermissionFlagsBits.ManageGuild),
      kick: r.permissions.has(PermissionFlagsBits.KickMembers),
      moderate: r.permissions.has(PermissionFlagsBits.ModerateMembers),
      manageMessages: r.permissions.has(PermissionFlagsBits.ManageMessages),
    })),
  );
  return {
    admin: ids.admin ? guild.roles.cache.get(ids.admin) ?? null : null,
    mod: ids.mod ? guild.roles.cache.get(ids.mod) ?? null : null,
    dj: ids.dj ? guild.roles.cache.get(ids.dj) ?? null : null,
  };
}

function remember(guildId: string, next: Partial<Picks>) {
  const prev = pending.get(guildId);
  const at = Date.now();
  if (prev && at - prev.at > PENDING_TTL_MS) {
    pending.set(guildId, { ...next, at });
    return;
  }
  pending.set(guildId, { ...prev, ...next, at });
}

export async function saveRankMapping(client: KnoxClient, guild: Guild, rank: Exclude<KnoxRank, "owner">, roleId: string) {
  if (roleId === guild.id) throw new Error("Pick a real role, not @everyone.");
  await client.db
    .insert(guilds)
    .values({ id: guild.id, name: guild.name, icon: guild.icon, ownerId: guild.ownerId })
    .onConflictDoUpdate({
      target: guilds.id,
      set: { name: guild.name, icon: guild.icon, ownerId: guild.ownerId },
    });
  await client.db
    .delete(guildPermissionRoles)
    .where(and(eq(guildPermissionRoles.guildId, guild.id), eq(guildPermissionRoles.rank, rank)));
  await client.db.insert(guildPermissionRoles).values({ guildId: guild.id, rank, roleId });
  await notifyGuildConfig(client.pool, guild.id);
  client.guildConfig.invalidate(guild.id);
}

export function maySetRanks(member: GuildMember) {
  return (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

function pickMenu(rank: StaffPickRank, defaultRoleId?: string) {
  const labels: Record<StaffPickRank, string> = {
    admin: "Admin — who can change the server",
    mod: "Mod / staff — who can lock, kick, warn",
    dj: "DJ (optional) — music controls",
  };
  const menu = new RoleSelectMenuBuilder().setCustomId(`${RANK_PICK_PREFIX}${rank}`).setPlaceholder(labels[rank]).setMinValues(0).setMaxValues(1);
  if (defaultRoleId) menu.setDefaultRoles(defaultRoleId);
  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);
}

export function rankSetupPayload(guild: Guild, color?: string) {
  const guessed = guessStaffRoles(guild);
  remember(guild.id, { admin: guessed.admin?.id, mod: guessed.mod?.id, dj: guessed.dj?.id });
  const guessLine = [
    guessed.admin ? `Admin → ${guessed.admin}` : null,
    guessed.mod ? `Mod → ${guessed.mod}` : null,
    guessed.dj ? `DJ → ${guessed.dj}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const embed = knoxEmbed(color)
    .setTitle("Who is staff here?")
    .setDescription(
      "ZARU only gives lock / kick / server power to the people you pick.\n" +
        "**Admin** can change the server. **Mod** can moderate. Everyone else can chat, ask, and play games.\n" +
        (guessLine ? `\nI guessed: ${guessLine}\nChange the menus if that's wrong, then **Save**.` : "\nPick the roles, then **Save**. Skip if you want me to keep guessing from names like Moderator / Admin."),
    )
    .setFooter({ text: "Only the owner or Manage Server can set this · /set-rank-role later" });
  return {
    embeds: [embed],
    components: [
      pickMenu("admin", guessed.admin?.id),
      pickMenu("mod", guessed.mod?.id),
      pickMenu("dj", guessed.dj?.id),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(RANK_SAVE_ID).setLabel("Save").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(RANK_SKIP_ID).setLabel("Skip — keep guessing").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

export async function handleRankPick(interaction: RoleSelectMenuInteraction, _client: KnoxClient) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Run this in a server.", ephemeral: true });
    return;
  }
  const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id));
  if (!maySetRanks(member)) {
    await interaction.reply({ content: "Only the owner or someone with Manage Server can set staff roles.", ephemeral: true });
    return;
  }
  const rank = interaction.customId.slice(RANK_PICK_PREFIX.length) as StaffPickRank;
  if (!PICK_RANKS.includes(rank)) return;
  const roleId = interaction.values[0];
  if (roleId === guild.id) {
    await interaction.reply({ content: "Pick a real role, not @everyone.", ephemeral: true });
    return;
  }
  remember(guild.id, { [rank]: roleId || undefined });
  await interaction.deferUpdate();
}

export async function handleRankSetupButton(interaction: ButtonInteraction, client: KnoxClient) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Run this in a server.", ephemeral: true });
    return;
  }
  const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id));
  if (!maySetRanks(member)) {
    await interaction.reply({ content: "Only the owner or someone with Manage Server can set staff roles.", ephemeral: true });
    return;
  }
  const cached = await client.guildConfig.get(guild.id);
  const color = cached.settings.embedColor;

  if (interaction.customId === RANK_OPEN_ID) {
    await interaction.reply({ ...rankSetupPayload(guild, color), ephemeral: true });
    return;
  }

  if (interaction.customId === RANK_SKIP_ID) {
    pending.delete(guild.id);
    await interaction.update({
      embeds: [
        knoxEmbed(color)
          .setTitle("I'll guess for now")
          .setDescription(
            "I'll treat roles named Admin / Moderator / Staff as staff, and Discord Kick / Timeout / Manage Messages as mods.\nYou can still set this later with `/set-rank-role`.",
          ),
      ],
      components: [],
    });
    return;
  }

  if (interaction.customId !== RANK_SAVE_ID) return;
  const picks = pending.get(guild.id);
  if (!picks || Date.now() - picks.at > PENDING_TTL_MS) {
    await interaction.reply({ content: "Those menus expired. Press **Pick staff roles** again.", ephemeral: true });
    return;
  }
  const saved: string[] = [];
  for (const rank of PICK_RANKS) {
    const roleId = picks[rank];
    if (!roleId) continue;
    const role = guild.roles.cache.get(roleId);
    if (!role || role.id === guild.id) continue;
    await saveRankMapping(client, guild, rank, role.id);
    saved.push(`**${rank}** → ${role}`);
  }
  pending.delete(guild.id);
  await interaction.update({
    embeds: [
      knoxEmbed(color)
        .setTitle(saved.length ? "Staff roles saved" : "Nothing was picked")
        .setDescription(
          saved.length
            ? `${saved.join("\n")}\n\nOwner can still ask ZARU anything. Members can chat and play. Change later with \`/set-rank-role\`.`
            : "No roles were picked. I'll keep guessing from names and Discord permissions. `/set-rank-role` any time.",
        ),
    ],
    components: [],
  });
}
