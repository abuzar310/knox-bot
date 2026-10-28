import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p>ZARU Bot — moderation, music, levels, economy, and tickets in one Discord bot.</p>
        <nav>
          <Link href="/commands">Commands</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/login">Log in</Link>
        </nav>
      </div>
    </footer>
  );
}
