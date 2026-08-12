import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

const discordId =
  process.env.AUTH_DISCORD_ID ?? process.env.DISCORD_CLIENT_ID ?? "";
const discordSecret =
  process.env.AUTH_DISCORD_SECRET ?? process.env.DISCORD_CLIENT_SECRET ?? "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Discord({
      clientId: discordId,
      clientSecret: discordSecret,
      // Must include url — passing only `params` replaces the whole authorization
      // object and Auth.js throws Invalid URL → error=Configuration.
      authorization: {
        url: "https://discord.com/api/oauth2/authorize",
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
});
