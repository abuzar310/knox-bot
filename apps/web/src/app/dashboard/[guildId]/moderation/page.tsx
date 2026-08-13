import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
      <div className="nav">
        <Link href={`/dashboard/${guildId}`}>← Overview</Link>
        <Link href={`/dashboard/${guildId}/permissions`}>Permissions</Link>
      </div>
      <p className="brand">ZARU</p>
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

        <button className="btn" type="submit">
          Save automod
        </button>
      </form>
    </main>
  );
}
