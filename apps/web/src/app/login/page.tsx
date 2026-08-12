export default function LoginPage() {
  return (
    <main>
      <p className="brand">Knox</p>
      <h1>Login</h1>
      <p className="muted">Use Discord to manage servers where you have Manage Server.</p>
      <div style={{ marginTop: "1.5rem" }}>
        <a
          className="btn"
          href="/api/auth/signin/discord?callbackUrl=/dashboard"
        >
          Continue with Discord
        </a>
      </div>
    </main>
  );
}
