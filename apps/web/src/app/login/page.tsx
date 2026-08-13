import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main>
      <p className="brand">ZARU</p>
      <h1>Login</h1>
      <p className="muted">
        Use Discord to manage servers where you have Manage Server.
      </p>
      {error ? (
        <p style={{ color: "#ff6b6b", marginTop: "1rem" }}>
          Auth error: {error}. Discord redirect is already set. If this
          persists after a refresh, wait for the latest deploy to go live.
        </p>
      ) : null}
      <form
        action={async () => {
          "use server";
          await signIn("discord", { redirectTo: "/dashboard" });
        }}
        style={{ marginTop: "1.5rem" }}
      >
        <button className="btn" type="submit">
          Continue with Discord
        </button>
      </form>
    </main>
  );
}
