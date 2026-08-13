import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import {
  canManageGuild,
  fetchBotGuildIds,
  fetchUserGuilds,
} from "@/lib/guilds";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const [userGuilds, botGuildIds] = await Promise.all([
    fetchUserGuilds(session.accessToken),
    fetchBotGuildIds().catch(() => new Set<string>()),
  ]);

  const manageable = userGuilds.filter(canManageGuild);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const inviteBase = clientId
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
    : null;

  return (
    <main>
      <div className="nav">
        <p className="brand" style={{ margin: 0 }}>
          ZARU
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="btn secondary" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <h1>Servers</h1>
      <p className="muted">Pick a server ZARU is in. Invite the bot if it is missing.</p>

      <div className="panel grid">
        {manageable.length === 0 ? (
          <p className="muted">No manageable servers found for this Discord account.</p>
        ) : (
          manageable.map((guild) => {
            const present = botGuildIds.has(guild.id);
            return (
              <div key={guild.id} className="guild-link" style={{ display: "grid", gap: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <strong>{guild.name}</strong>
                  <span className="muted">{present ? "bot present" : "bot missing"}</span>
                </div>
                {present ? (
                  <Link href={`/dashboard/${guild.id}`}>Configure →</Link>
                ) : inviteBase ? (
                  <a href={`${inviteBase}&guild_id=${guild.id}&disable_guild_select=true`} target="_blank" rel="noreferrer">
                    Invite ZARU →
                  </a>
                ) : (
                  <span className="muted">Set DISCORD_CLIENT_ID to generate invite links</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
