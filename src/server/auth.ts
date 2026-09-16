import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { env } from "@/env";
import { slugify } from "@aso/shared";
import { db } from "@/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/**
 * Ensures a user owns at least one organization. Called on first sign-in from
 * any provider, so no authenticated request ever has a null tenant.
 */
export async function ensureOrganization(userId: string, name?: string | null, email?: string | null) {
  const existing = await db.membership.findFirst({ where: { userId } });
  if (existing) return existing.organizationId;

  const base = slugify(name ?? email?.split("@")[0] ?? "workspace");
  let slug = base;
  for (let i = 1; await db.organization.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${i}`;
  }

  const org = await db.organization.create({
    data: {
      name: name ? `${name}'s workspace` : "My workspace",
      slug,
      memberships: { create: { userId, role: "OWNER" } },
    },
  });

  // Any pending invites for this address become memberships now.
  if (email) {
    const invites = await db.invite.findMany({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    for (const invite of invites) {
      await db.membership.upsert({
        where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
        create: { userId, organizationId: invite.organizationId, role: invite.role },
        update: {},
      });
      await db.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    }
  }

  return org.id;
}

const providers: NextAuthConfig["providers"] = [];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

// Local development escape hatch: sign in with an email, no password, no SMTP.
// Never registered in production.
if (env.NODE_ENV !== "production") {
  providers.push(
    Credentials({
      id: "dev",
      name: "Developer login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
        if (!email.includes("@")) return null;

        const user = await db.user.upsert({
          where: { email },
          create: { email, name: email.split("@")[0], emailVerified: new Date() },
          update: {},
        });
        await ensureOrganization(user.id, user.name, user.email);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

export const authConfig = {
  adapter: PrismaAdapter(db),
  providers,
  // JWT strategy so the dev Credentials provider works alongside OAuth.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        await ensureOrganization(user.id, user.name, user.email);
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  trustHost: true,
  secret: env.AUTH_SECRET,
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
