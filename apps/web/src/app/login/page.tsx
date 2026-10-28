import { signIn } from "@/auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <>
      <SiteHeader />
      <main>
      <h1>Log in</h1>
      <p className="muted">
        Use Discord to manage servers where you have Manage Server.
      </p>
      {error ? (
        <p style={{ color: "#ff6b6b", marginTop: "1rem" }}>
          Discord sign-in did not finish. Tap Continue with Discord to try again.
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
      <SiteFooter />
    </>
  );
}
