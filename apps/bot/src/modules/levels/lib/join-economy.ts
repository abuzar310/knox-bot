import type { GuildMember } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { getProfile } from "../../../lib/profiles.js";
import { grantMoney } from "../../../lib/xp.js";

/** UnbelievaBoat set-start-balance: new members start with bank coins once they have nothing yet */
export async function applyJoinStartBalance(client: KnoxClient, member: GuildMember) {
  if (member.user.bot) return;
  const cached = await client.guildConfig.get(member.guild.id);
  const start = cached.settings.features.startBankBalance ?? 0;
  if (start <= 0 || !cached.settings.features.economyEnabled) return;
  const profile = await getProfile(client.db, member.guild.id, member.id);
  if (profile.wallet + profile.bank > 0) return;
  await grantMoney(client.db, member.guild.id, member.id, start, true);
}
