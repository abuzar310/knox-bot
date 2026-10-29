import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds, getGuildSettings } from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { removeAutomodRuleAction, saveAutomodRuleAction } from "../actions";

const KINDS = ["spam", "invites", "links", "caps", "emoji", "mentions", "words", "duplicates", "attachments"] as const;
const ACTIONS = ["delete", "warn", "timeout", "kick", "ban"] as const;

export default async function AutomodRulesPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  const guild = (await fetchUserGuilds(session.accessToken)).find((row) => row.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const rules = (await getGuildSettings(guildId)).moderation.automodRules;

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Automod rules</h1>
      <p className="muted">Each rule is one detector and one punishment. Staff with Manage Messages are skipped. Caps uses the threshold as a percent.</p>
      <ul>
        {rules.map((rule) => (
          <li key={rule.id}>
            <form action={removeAutomodRuleAction}>
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="id" value={rule.id} />
              <span>
                {rule.kind} → {rule.action}
                {rule.kind === "words" && rule.words.length ? ` (${rule.words.join(", ")})` : ` at ${rule.threshold}`}
              </span>
              <button type="submit">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={saveAutomodRuleAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label>
          Detector
          <select name="kind" defaultValue="links">
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select name="action" defaultValue="delete">
            {ACTIONS.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </label>
        <label>
          Threshold
          <input type="text" name="threshold" defaultValue="5" />
        </label>
        <label>
          Words (comma separated, for the words detector)
          <input type="text" name="words" defaultValue="" />
        </label>
        <label>
          Ignored channel ids
          <input type="text" name="ignoredChannelIds" defaultValue="" />
        </label>
        <button type="submit">Add rule</button>
      </form>
    </main>
  );
}
