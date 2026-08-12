import Link from "next/link";
import { redirect } from "next/navigation";
import { KNOX_RANKS } from "@knox/shared";
import { auth } from "@/auth";
import {
  canManageGuild,
  fetchUserGuilds,
  getPermissionRoles,
} from "@/lib/guilds";
import { saveRankRoleAction } from "../actions";

export default async function PermissionsPage({
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

  const rows = await getPermissionRoles(guildId);
  const map = new Map(rows.map((r) => [r.rank, r.roleId]));

  return (
    <main>
      <div className="nav">
        <Link href={`/dashboard/${guildId}`}>← Overview</Link>
      </div>
      <p className="brand">Knox</p>
      <h1>Permissions</h1>
      <p className="muted">
        Map Discord role IDs to Knox ranks. Guild owner always has owner rank.
      </p>

      <div className="panel grid">
        {KNOX_RANKS.filter((r) => r !== "owner").map((rank) => (
          <form key={rank} action={saveRankRoleAction} className="row">
            <input type="hidden" name="guildId" value={guildId} />
            <input type="hidden" name="rank" value={rank} />
            <label style={{ flex: 1 }}>
              {rank}
              <input
                type="text"
                name="roleId"
                placeholder="Discord role snowflake"
                defaultValue={map.get(rank) ?? ""}
                required
              />
            </label>
            <button className="btn secondary" type="submit">
              Save
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
