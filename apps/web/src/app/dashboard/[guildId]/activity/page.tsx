import { and, desc, eq, gte, sum } from "drizzle-orm";
import { redirect } from "next/navigation";
import { channelDailyMessages, guildDailyStats, memberDailyMessages } from "@knox/db";
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
  const since = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(guildDailyStats)
    .where(eq(guildDailyStats.guildId, guildId))
    .orderBy(desc(guildDailyStats.day))
    .limit(14);
  const members = await db
    .select({ userId: memberDailyMessages.userId, messages: sum(memberDailyMessages.messages) })
    .from(memberDailyMessages)
    .where(and(eq(memberDailyMessages.guildId, guildId), gte(memberDailyMessages.day, since)))
    .groupBy(memberDailyMessages.userId)
    .orderBy(desc(sum(memberDailyMessages.messages)))
    .limit(8);
  const channels = await db
    .select({ channelId: channelDailyMessages.channelId, messages: sum(channelDailyMessages.messages) })
    .from(channelDailyMessages)
    .where(and(eq(channelDailyMessages.guildId, guildId), gte(channelDailyMessages.day, since)))
    .groupBy(channelDailyMessages.channelId)
    .orderBy(desc(sum(channelDailyMessages.messages)))
    .limit(8);
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
      <h2>Most active members, 14 days</h2>
      <ul>
        {members.map((row) => (
          <li key={row.userId}>{row.userId} · {Number(row.messages ?? 0)} messages</li>
        ))}
      </ul>
      <h2>Busiest channels, 14 days</h2>
      <ul>
        {channels.map((row) => (
          <li key={row.channelId}>{row.channelId} · {Number(row.messages ?? 0)} messages</li>
        ))}
      </ul>
    </main>
  );
}
