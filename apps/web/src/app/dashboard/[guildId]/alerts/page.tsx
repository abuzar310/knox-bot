import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { feedSubscriptions } from "@knox/db";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds, getGuildSettings } from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { DASHBOARD_FEED_KINDS } from "@/lib/feed-source";
import { addFeedAction, removeFeedAction, saveAutoPublishAction, setFeedPausedAction } from "../actions";

const KIND_LABEL: Record<(typeof DASHBOARD_FEED_KINDS)[number], string> = {
  youtube: "YouTube",
  rss: "RSS",
  twitch: "Twitch",
  kick: "Kick",
  bluesky: "Bluesky",
};

export default async function AlertsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  const guild = (await fetchUserGuilds(session.accessToken)).find((row) => row.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const features = (await getGuildSettings(guildId)).features;
  const feeds = await db.select().from(feedSubscriptions).where(eq(feedSubscriptions.guildId, guildId)).orderBy(asc(feedSubscriptions.id));

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Alerts</h1>
      <p className="muted">
        Same list as <code>/feed</code>. New uploads and live streams post in the channel you pick. YouTube handles still need{" "}
        <code>/feed add youtube</code> in Discord.
      </p>

      {feeds.length === 0 ? (
        <p className="muted">No feeds yet.</p>
      ) : (
        <ul>
          {feeds.map((feed) => (
            <li key={feed.id}>
              <strong>
                #{feed.id} {KIND_LABEL[feed.kind]} · {feed.label}
              </strong>
              <span className="muted">
                {" "}
                → {feed.channelId}
                {feed.paused ? " · paused" : ""}
                {feed.failures ? ` · ${feed.failures} fails` : ""}
              </span>
              <form action={setFeedPausedAction} style={{ display: "inline", marginLeft: "0.5rem" }}>
                <input type="hidden" name="guildId" value={guildId} />
                <input type="hidden" name="id" value={feed.id} />
                <input type="hidden" name="paused" value={feed.paused ? "0" : "1"} />
                <button type="submit">{feed.paused ? "Resume" : "Pause"}</button>
              </form>
              <form action={removeFeedAction} style={{ display: "inline", marginLeft: "0.35rem" }}>
                <input type="hidden" name="guildId" value={guildId} />
                <input type="hidden" name="id" value={feed.id} />
                <button type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addFeedAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label>
          Kind
          <select name="kind" defaultValue="youtube">
            {DASHBOARD_FEED_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Channel, URL, or id
          <input type="text" name="source" placeholder="UC… id, https feed, twitch name" />
        </label>
        <label>
          Post in channel id
          <input type="text" name="channelId" />
        </label>
        <label>
          Ping role id
          <input type="text" name="pingRoleId" placeholder="Optional" />
        </label>
        <label>
          Custom message
          <input type="text" name="template" placeholder="{role} {author} {title} {url}" />
        </label>
        <button type="submit">Add feed</button>
      </form>

      <form action={saveAutoPublishAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label>
          Auto-publish announcement channel ids
          <input
            type="text"
            name="autoPublishChannelIds"
            defaultValue={features.autoPublishChannelIds.join(", ")}
            placeholder="Comma separated"
          />
        </label>
        <button type="submit">Save auto-publish</button>
      </form>
    </main>
  );
}
