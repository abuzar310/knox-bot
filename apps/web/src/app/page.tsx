import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { inviteUrl } from "@/lib/invite";

const FEATURES = [
  {
    title: "Moderation",
    text: "Warns, bans, automod, raid mode, and a case log. Staff act from slash commands or plain language.",
  },
  {
    title: "Music",
    text: "YouTube and Spotify in voice, with a live queue panel, filters, playlists, and 24/7 stay.",
  },
  {
    title: "Levels",
    text: "Chat and voice XP, rank cards, role rewards, and channels that earn nothing.",
  },
  {
    title: "Economy",
    text: "Work, daily, bank, rob, shop, and casino games. Members type ?work and ?money.",
  },
  {
    title: "Tickets",
    text: "Topic panels, private channels, claim, HTML transcripts, and a dashboard for limits.",
  },
  {
    title: "Alerts",
    text: "YouTube, Twitch, Kick, RSS, and Bluesky posts land in the channel you pick.",
  },
  {
    title: "Welcome",
    text: "Join cards, invite tracking, autorole, reaction roles, giveaways, and starboard.",
  },
  {
    title: "Assistant",
    text: "Staff ask ZARU Bot in normal sentences. Members chat with the prefix.",
  },
];

const STEPS = [
  { n: "01", title: "Add the bot", text: "Invite ZARU Bot with the permissions it needs. No Administrator role." },
  { n: "02", title: "Run setup", text: "In Discord, run /setup start. Welcome, logs, and protection turn on from one command." },
  { n: "03", title: "Open the dashboard", text: "Log in with Discord to tune tickets, economy, automod, and staff ranks." },
];

export default function HomePage() {
  const invite = inviteUrl();

  return (
    <>
      <SiteHeader />
      <main className="marketing">
        <section className="hero">
          <div>
            <p className="eyebrow">All-in-one Discord bot</p>
            <h1>Run the server from one bot.</h1>
            <p className="lede">
              ZARU Bot covers moderation, music, levels, economy, tickets, and alerts. Members use a short prefix.
              Staff use slash commands and a web dashboard.
            </p>
            <div className="hero-actions">
              {invite ? (
                <a className="btn" href={invite}>
                  Add to Discord
                </a>
              ) : null}
              <Link className="btn secondary" href="/commands">
                Browse commands
              </Link>
              <Link className="btn secondary" href="/dashboard">
                Dashboard
              </Link>
            </div>
          </div>
          <aside className="hero-card" aria-label="Example commands">
            <p className="hero-card-title">In your server</p>
            <ul>
              <li>
                <code>/setup start</code>
                <span>Turn the server on</span>
              </li>
              <li>
                <code>?work</code>
                <span>Earn coins</span>
              </li>
              <li>
                <code>?play song name</code>
                <span>Queue music</span>
              </li>
              <li>
                <code>/ticket panel</code>
                <span>Open support</span>
              </li>
            </ul>
          </aside>
        </section>

        <section id="features">
          <h2>What you replace</h2>
          <p className="muted">One invite instead of a stack of separate bots.</p>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2>Set up in three steps</h2>
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span>{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="cta-band">
          <div>
            <h2>Look up any command</h2>
            <p className="muted">Search slash commands and prefix aliases, the same way members type them.</p>
          </div>
          <Link className="btn" href="/commands">
            Open command list
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
