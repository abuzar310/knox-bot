import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import { canManageGuild, ensureGuildRow, fetchUserGuilds, getGuildSettings } from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { saveWelcomeAction } from "../actions";

export default async function WelcomePage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");
  const guild = (await fetchUserGuilds(session.accessToken)).find((row) => row.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");
  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const community = (await getGuildSettings(guildId)).community;

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Welcome</h1>
      <p className="muted">The picture card can sit on top of an image you host. Use a direct https link to a png or jpg.</p>
      <form action={saveWelcomeAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <label className="toggle">
          <span><strong>Welcome messages</strong></span>
          <input type="checkbox" name="welcomeEnabled" defaultChecked={community.welcomeEnabled} />
        </label>
        <label>
          Welcome channel id
          <input type="text" name="welcomeChannelId" defaultValue={community.welcomeChannelId ?? ""} />
        </label>
        <label className="toggle">
          <span><strong>Picture card</strong></span>
          <input type="checkbox" name="welcomeCardEnabled" defaultChecked={community.welcomeCardEnabled} />
        </label>
        <label>
          Background image URL
          <input type="text" name="welcomeBackgroundUrl" defaultValue={community.welcomeBackgroundUrl ?? ""} placeholder="https://…" />
        </label>
        <button type="submit">Save welcome</button>
      </form>
    </main>
  );
}
