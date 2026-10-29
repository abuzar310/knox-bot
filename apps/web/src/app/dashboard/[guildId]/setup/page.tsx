import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds, getGuildSettings } from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { addDelayRoleAction, addPurgeAction, removeDelayRoleAction, removePurgeAction, saveSetupAction } from "../actions";

export default async function SetupPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  const guild = (await fetchUserGuilds(session.accessToken)).find((row) => row.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const features = (await getGuildSettings(guildId)).features;

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Setup</h1>
      <p className="muted">Voice chats, free-game posts, roles that arrive after a wait, and channels that clear themselves.</p>

      <form action={saveSetupAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label className="toggle">
          <span>
            <strong>Voice text</strong>
            <span className="muted"> — a private chat opens with each join-to-create room and closes when the room does</span>
          </span>
          <input type="checkbox" name="voiceTextEnabled" defaultChecked={features.voiceTextEnabled} />
        </label>
        <label>
          Free games channel id
          <input type="text" name="freeGamesChannelId" defaultValue={features.freeGamesChannelId ?? ""} placeholder="Empty turns it off" />
        </label>
        <button type="submit">Save</button>
      </form>

      <h2>Delayed roles</h2>
      <ul>
        {features.delayedRoles.map((row) => (
          <li key={row.roleId}>
            <form action={removeDelayRoleAction}>
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="roleId" value={row.roleId} />
              <span>Role {row.roleId} after {row.delayMinutes} min</span>
              <button type="submit">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addDelayRoleAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label>
          Role id
          <input type="text" name="roleId" />
        </label>
        <label>
          Minutes after join
          <input type="text" name="minutes" defaultValue="10" />
        </label>
        <button type="submit">Add delayed role</button>
      </form>

      <h2>Scheduled purge</h2>
      <ul>
        {features.scheduledPurges.map((row) => (
          <li key={row.channelId}>
            <form action={removePurgeAction}>
              <input type="hidden" name="guildId" value={guildId} />
              <input type="hidden" name="channelId" value={row.channelId} />
              <span>Channel {row.channelId} every {row.everyHours} h</span>
              <button type="submit">Remove</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addPurgeAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label>
          Channel id
          <input type="text" name="channelId" />
        </label>
        <label>
          Every N hours
          <input type="text" name="hours" defaultValue="24" />
        </label>
        <button type="submit">Add purge</button>
      </form>

      <h2>Emoji self-roles</h2>
      <ul>
        {features.emojiRolePanels.map((panel) => (
          <li key={panel.messageId}>
            Message {panel.messageId} in {panel.channelId} · {panel.mode} · {panel.pairs.length} roles
          </li>
        ))}
      </ul>
      <p className="muted">Post and edit these in Discord with /selfrole. The list above is what is saved.</p>
    </main>
  );
}
