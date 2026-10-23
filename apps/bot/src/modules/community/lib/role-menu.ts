// Role menus: a dropdown whose options are roles; picking updates the member's roles to match the selection.
import { type StringSelectMenuInteraction } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { canGrantRole } from "../../../lib/roles.js";

export const ROLE_MENU_ID = "knox:rolemenu";

export async function applyRoleMenu(interaction: StringSelectMenuInteraction, _client: KnoxClient) {
  const guild = interaction.guild;
  if (!guild) return;
  const offered = interaction.component.options.map((o) => o.value);
  const chosen = new Set(interaction.values);
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;
  const added: string[] = [];
  const removed: string[] = [];
  const skipped: string[] = [];
  for (const roleId of offered) {
    const role = guild.roles.cache.get(roleId);
    if (!canGrantRole(role)) {
      if (chosen.has(roleId)) skipped.push(roleId);
      continue;
    }
    const has = member.roles.cache.has(roleId);
    if (chosen.has(roleId) && !has) {
      await member.roles.add(role, "Role menu").then(() => added.push(roleId), () => skipped.push(roleId));
    } else if (!chosen.has(roleId) && has) {
      await member.roles.remove(role, "Role menu").then(() => removed.push(roleId), () => skipped.push(roleId));
    }
  }
  const parts = [
    added.length ? `Added ${added.map((id) => `<@&${id}>`).join(", ")}` : "",
    removed.length ? `Removed ${removed.map((id) => `<@&${id}>`).join(", ")}` : "",
    skipped.length ? `Couldn't change ${skipped.map((id) => `<@&${id}>`).join(", ")} (ask an admin)` : "",
  ].filter(Boolean);
  await interaction.reply({ content: parts.length ? parts.join(". ") + "." : "Your roles already matched that pick.", ephemeral: true, allowedMentions: { parse: [] } });
}
