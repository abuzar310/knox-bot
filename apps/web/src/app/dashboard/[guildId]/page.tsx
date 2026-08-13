import Link from "next/link";
import { redirect } from "next/navigation";
import { MODULE_IDS } from "@knox/shared";
import { auth } from "@/auth";
import {
  canManageGuild,
  ensureGuildRow,
  fetchUserGuilds,
  getGuildSettings,
} from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { saveOverviewAction } from "./actions";

export default async function GuildOverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const userGuilds = await fetchUserGuilds(session.accessToken);
  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");

  const { db } = getDb();
  await ensureGuildRow(db, {
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
  });
  const settings = await getGuildSettings(guildId);

  return (
    <main>
      <div className="nav">
        <Link href="/dashboard">← Servers</Link>
        <Link href={`/dashboard/${guildId}/moderation`}>Moderation</Link>
        <Link href={`/dashboard/${guildId}/permissions`}>Permissions</Link>
      </div>
      <p className="brand">ZARU</p>
      <h1>{guild.name}</h1>
      <p className="muted">Overview — toggles sync to the bot without restart.</p>

      <form action={saveOverviewAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="guildName" value={guild.name} />

        <div className="row">
          <label>
            Embed color
            <input type="color" name="embedColor" defaultValue={settings.embedColor} />
          </label>
          <label style={{ flex: 1 }}>
            Log channel ID
            <input
              type="text"
              name="logChannelId"
              placeholder="optional snowflake"
              defaultValue={settings.logChannelId ?? ""}
            />
          </label>
        </div>

        <div>
          <h2 style={{ margin: "0.5rem 0" }}>Modules</h2>
          {MODULE_IDS.map((id) => {
            const locked = id === "core" || id === "admin";
            return (
              <label key={id} className="toggle">
                <span>
                  <strong>{id}</strong>
                  {locked ? <span className="muted"> (required)</span> : null}
                </span>
                <input
                  type="checkbox"
                  name={`module_${id}`}
                  defaultChecked={settings.moduleFlags[id]}
                  disabled={locked}
                />
              </label>
            );
          })}
        </div>

        <button className="btn" type="submit">
          Save changes
        </button>
      </form>
    </main>
  );
}
