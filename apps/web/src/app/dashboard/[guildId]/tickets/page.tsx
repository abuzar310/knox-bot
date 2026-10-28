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
import { saveTicketsAction } from "../actions";

export default async function TicketSettingsPage({
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
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const settings = await getGuildSettings(guildId);
  const f = settings.features;

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Tickets</h1>
      <p className="muted">
        Ticket Tool-style limits and transcripts. Post the panel in Discord with <code>/ticket panel</code> after saving
        a category.
      </p>

      <form action={saveTicketsAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="guildName" value={guild.name} />

        <label>
          Ticket category ID
          <input type="text" name="ticketCategoryId" placeholder="category snowflake" defaultValue={f.ticketCategoryId ?? ""} />
        </label>
        <label>
          Ticket log channel ID
          <span className="muted"> — HTML transcripts on close (falls back to overview log channel)</span>
          <input type="text" name="ticketLogChannelId" placeholder="optional" defaultValue={f.ticketLogChannelId ?? ""} />
        </label>
        <label>
          Max open tickets per member (1–5)
          <input type="number" name="maxOpenTicketsPerUser" min={1} max={5} defaultValue={f.maxOpenTicketsPerUser ?? 1} />
        </label>
        <label className="toggle">
          <span>
            <strong>Soft close</strong>
            <span className="muted"> — lock channel instead of deleting; reopen with /ticket reopen</span>
          </span>
          <input type="checkbox" name="ticketSoftClose" defaultChecked={f.ticketSoftClose ?? false} />
        </label>

        <p className="muted">
          Topics: use <code>/ticket topics add</code> in Discord, then <code>/ticket panel</code>.{" "}
          <Link href="/commands?q=ticket">Browse ticket commands →</Link>
        </p>

        <button type="submit" className="btn">
          Save ticket settings
        </button>
      </form>
    </main>
  );
}
