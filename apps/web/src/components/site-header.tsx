import Link from "next/link";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { inviteUrl } from "@/lib/invite";

export async function SiteHeader() {
  const session = await auth();
  const invite = inviteUrl();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          <BrandMark size={32} />
        </Link>
        <nav className="site-nav" aria-label="Site">
          <Link href="/#features">Features</Link>
          <Link href="/commands">Commands</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <div className="site-actions">
          {session ? (
            <Link className="btn secondary" href="/dashboard">
              Dashboard
            </Link>
          ) : (
            <Link className="btn secondary" href="/login">
              Log in
            </Link>
          )}
          {invite ? (
            <a className="btn" href={invite}>
              Add to Discord
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
