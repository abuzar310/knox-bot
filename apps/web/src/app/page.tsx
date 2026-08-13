import Link from "next/link";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";

const INVITE_PERMISSIONS = "8";

function inviteUrl() {
  const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.AUTH_DISCORD_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: INVITE_PERMISSIONS,
    scope: "bot applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export default async function HomePage() {
  const session = await auth();
  const invite = inviteUrl();

  return (
    <main>
      <p className="brand">
        <BrandMark size={36} />
      </p>
      <h1>Music, moderation, and setup for Discord</h1>
      <p className="muted">
        Play YouTube in voice. Welcome members and track who invited them. Tickets, levels, giveaways, and a live
        control panel. After you add ZARU, run <code>/setup start</code> then <code>/help</code>.
      </p>
      <div className="row" style={{ marginTop: "1.5rem" }}>
        {invite ? (
          <a className="btn" href={invite}>
            Add to Discord
          </a>
        ) : null}
        {session ? (
          <Link className={invite ? "btn secondary" : "btn"} href="/dashboard">
            Open dashboard
          </Link>
        ) : (
          <Link className={invite ? "btn secondary" : "btn"} href="/login">
            Login with Discord
          </Link>
        )}
      </div>
      <div className="panel" style={{ marginTop: "2rem" }}>
        <p style={{ marginTop: 0 }}>
          <strong>What ZARU can do</strong>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Setup · Music · Moderation · Tickets · Giveaways · Levels · Starboard · LFG
        </p>
      </div>
    </main>
  );
}
