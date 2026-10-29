import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { guildDailyStats } from "@knox/db";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds } from "@/lib/guilds";
import { getDb } from "@/lib/db";

export default async function ActivityPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  const guild = (await fetchUserGuilds(session.accessToken)).find((row) => row.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const rows = await db
    .select()
    .from(guildDailyStats)
    .where(eq(guildDailyStats.guildId, guildId))
    .orderBy(desc(guildDailyStats.day))
    .limit(14);
  const peak = Math.max(1, ...rows.map((row) => row.messages));

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Activity</h1>
      <p className="muted">Messages, joins, leaves, and voice minutes for the last 14 days ZARU has counted.</p>
      {rows.length === 0 ? (
        <p className="muted">Nothing counted yet. The table fills as people talk, join, and sit in voice.</p>
      ) : (
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Messages</th>
            <th></th>
            <th>Joins</th>
            <th>Leaves</th>
            <th>Voice minutes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <td>{row.day}</td>
              <td>{row.messages}</td>
              <td>
                <span style={{ display: "inline-block", height: 8, width: `${Math.round((row.messages / peak) * 120)}px`, background: "currentColor" }} />
              </td>
              <td>{row.joins}</td>
              <td>{row.leaves}</td>
              <td>{row.voiceMinutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </main>
  );
}
