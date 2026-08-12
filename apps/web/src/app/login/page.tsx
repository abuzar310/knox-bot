import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main>
      <p className="brand">Knox</p>
      <h1>Login</h1>
      <p className="muted">Use Discord to manage servers where you have Manage Server.</p>
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
