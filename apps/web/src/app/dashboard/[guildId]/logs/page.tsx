import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds, getGuildSettings } from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { saveLogChannelsAction } from "../actions";

export default async function LogsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  const guild = (await fetchUserGuilds(session.accessToken)).find((row) => row.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const features = (await getGuildSettings(guildId)).features;
  const field = (name: string, label: string, value: string | null) => (
    <label>
      {label}
      <input type="text" name={name} defaultValue={value ?? ""} placeholder="Channel id, or empty for the main log" />
    </label>
  );

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Logs</h1>
      <p className="muted">Each kind can have its own channel. An empty box uses the log channel from Overview.</p>
      <form action={saveLogChannelsAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label className="toggle">
          <span><strong>Messages</strong><span className="muted"> — edits and deletes</span></span>
          <input type="checkbox" name="logMessages" defaultChecked={features.logMessages} />
        </label>
        {field("logMessageChannelId", "Message log channel id", features.logMessageChannelId)}
        <label className="toggle">
          <span><strong>Members</strong><span className="muted"> — nicknames and roles</span></span>
          <input type="checkbox" name="logMembers" defaultChecked={features.logMembers} />
        </label>
        {field("logMemberChannelId", "Member log channel id", features.logMemberChannelId)}
        {field("logJoinChannelId", "Join and leave channel id", features.logJoinChannelId)}
        <label className="toggle">
          <span><strong>Server</strong><span className="muted"> — channels, roles, bans, with who did it</span></span>
          <input type="checkbox" name="logServer" defaultChecked={features.logServer} />
        </label>
        {field("logServerChannelId", "Server log channel id", features.logServerChannelId)}
        <label className="toggle">
          <span><strong>Voice</strong><span className="muted"> — joins, leaves, moves</span></span>
          <input type="checkbox" name="logVoice" defaultChecked={features.logVoice} />
        </label>
        {field("logVoiceChannelId", "Voice log channel id", features.logVoiceChannelId)}
        <button type="submit">Save logs</button>
      </form>
    </main>
  );
}
