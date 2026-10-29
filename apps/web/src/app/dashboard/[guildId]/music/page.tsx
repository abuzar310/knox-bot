import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds, getGuildSettings } from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { saveMusicAction } from "../actions";

export default async function MusicPage({ params }: { params: Promise<{ guildId: string }> }) {
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
      <h1>Music</h1>
      <p className="muted">
        Members use <code>?play song name</code>, or just type the song in the request channel. The player buttons cover skip, bass, nightcore, vaporwave, grab, and replay. A DJ rank on the Permissions page keeps skip votes for everyone else.
      </p>
      <form action={saveMusicAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label>
          Request channel id
          <input type="text" name="musicChannelId" defaultValue={features.musicChannelId ?? ""} placeholder="Typing a song name here plays it" />
        </label>
        <label>
          24/7 voice channel id
          <input type="text" name="alwaysVoiceChannelId" defaultValue={features.alwaysVoiceChannelId ?? ""} placeholder="ZARU stays in this voice channel" />
        </label>
        <label>
          Starting volume (1–100)
          <input type="text" name="musicVolume" defaultValue={String(features.musicVolume)} />
        </label>
        <label>
          Leave an empty channel after (seconds, 0 stays)
          <input type="text" name="musicLeaveSeconds" defaultValue={String(features.musicLeaveSeconds)} />
        </label>
        <button type="submit">Save music</button>
      </form>
    </main>
  );
}
