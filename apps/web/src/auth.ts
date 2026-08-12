import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Env (Render):
 * - AUTH_SECRET (required)
 * - AUTH_DISCORD_ID
 * - AUTH_DISCORD_SECRET
 * - AUTH_TRUST_HOST=true
 * Do NOT set AUTH_URL to the site root — that causes Invalid URL / Configuration errors.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Discord({
      authorization: {
        params: { scope: "identify guilds" },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
      }
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  debug: process.env.AUTH_DEBUG === "true",
});
