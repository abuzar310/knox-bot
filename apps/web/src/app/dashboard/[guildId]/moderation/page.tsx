import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import {
  canManageGuild,
  ensureGuildRow,
  fetchUserGuilds,
  getGuildSettings,
} from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { saveModerationAction } from "../actions";

export default async function ModerationSettingsPage({
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
  const mod = settings.moderation;

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Moderation</h1>
      <p className="muted">
        Automod + case system. Set a log channel on Overview so actions are posted.
      </p>

      <form action={saveModerationAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="guildName" value={guild.name} />

        <label className="toggle">
          <span>
            <strong>Anti-invite</strong>
            <span className="muted"> — delete + 10m mute on invite links</span>
          </span>
          <input type="checkbox" name="antiInvite" defaultChecked={mod.antiInvite} />
        </label>

        <label className="toggle">
          <span>
            <strong>Anti-spam</strong>
            <span className="muted"> — 6+ messages in 7s</span>
          </span>
          <input type="checkbox" name="antiSpam" defaultChecked={mod.antiSpam} />
        </label>

        <label>
          Max mentions (0 = off)
          <input
            type="text"
            name="maxMentions"
            defaultValue={String(mod.maxMentions)}
          />
        </label>

        <label>
          Ignored channel IDs (comma-separated)
          <input
            type="text"
            name="ignoredChannelIds"
            placeholder="123,456"
            defaultValue={mod.ignoredChannelIds.join(",")}
          />
        </label>

        <label className="toggle">
          <span>
            <strong>Anti-phishing</strong>
            <span className="muted"> — delete + 10m mute on known scam links and fake Discord/Nitro/Steam sites</span>
          </span>
          <input type="checkbox" name="antiPhishing" defaultChecked={mod.antiPhishing} />
        </label>

        <label>
          Join gate: minimum account age in hours (0 = off; too-new accounts are DMed and kicked)
          <input type="text" name="joinGateMinAccountAgeHours" defaultValue={String(mod.joinGateMinAccountAgeHours)} />
        </label>

        <label className="toggle">
          <span>
            <strong>Join gate: avatar required</strong>
            <span className="muted"> — members without a profile picture are turned away</span>
          </span>
          <input type="checkbox" name="joinGateRequireAvatar" defaultChecked={mod.joinGateRequireAvatar} />
        </label>

        <label>
          Join gate action
          <select name="joinGateAction" defaultValue={mod.joinGateAction}>
            <option value="kick">Kick</option>
            <option value="ban">Ban</option>
          </select>
        </label>

        <label>
          Auto raid mode at this many joins per minute (0 = off; pauses invites and turns joins away for 30 minutes)
          <input type="text" name="raidJoinsPerMinute" defaultValue={String(mod.raidJoinsPerMinute)} />
        </label>

        <label className="toggle">
          <span>
            <strong>Anti-nuke</strong>
            <span className="muted"> — stop someone who deletes channels, roles, or bans too fast</span>
          </span>
          <input type="checkbox" name="antiNuke" defaultChecked={mod.antiNuke} />
        </label>
        <label>
          Anti-nuke action
          <select name="antiNukeAction" defaultValue={mod.antiNukeAction}>
            <option value="strip">Take their roles</option>
            <option value="kick">Kick</option>
            <option value="ban">Ban</option>
          </select>
        </label>
        {mod.raidMode ? <p className="muted">Raid mode is ON right now (ends {mod.raidModeUntil ?? "when switched off"}). Use /raidmode off in Discord to end it.</p> : null}

        <button className="btn" type="submit">
          Save automod
        </button>
      </form>
    </main>
  );
}
