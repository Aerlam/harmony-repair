import Discord from "@auth/core/providers/discord";

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function authConfig() {
  return {
    basePath: "/api/auth",
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    providers: [
      Discord({
        clientId: process.env.AUTH_DISCORD_ID,
        clientSecret: process.env.AUTH_DISCORD_SECRET,
        issuer: "https://discord.com",
        authorization: { params: { scope: "identify" } },
      }),
    ],
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
    callbacks: {
      async session({ session, token }) {
        if (session.user && token.sub) session.user.id = token.sub;
        return session;
      },
    },
    pages: { signIn: "/login/" },
  };
}
