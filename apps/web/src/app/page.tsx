import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main>
      <p className="brand">Knox</p>
      <h1>Master control for your servers</h1>
      <p className="muted">
        Configure modules, permissions, and brand color. The bot picks up changes live.
      </p>
      <div className="row" style={{ marginTop: "1.5rem" }}>
        {session ? (
          <Link className="btn" href="/dashboard">
            Open dashboard
          </Link>
        ) : (
          <Link className="btn" href="/login">
            Login with Discord
          </Link>
        )}
      </div>
    </main>
  );
}
