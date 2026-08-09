import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

// NextAuth (Auth.js v5) — e-mail + jelszó; Google OAuth később bővíthető.
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? "demo-titok-csak-bemutatohoz",
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "E-mail és jelszó",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Jelszó", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.deletedAt) return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId) (session as any).userId = token.userId;
      return session;
    },
  },
});

/** A bejelentkezett felhasználó + szervezet; védett oldalak ezt hívják. */
export async function requireUser() {
  const session = await auth();
  const userId = (session as any)?.userId as string | undefined;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  return user;
}

/**
 * A bejelentkezett felhasználó; DEMO_MODE="1" esetén (bejelentkezés nélküli
 * demó) session hiányában az első (demo) felhasználóval dolgozunk.
 */
export async function currentUserOrDemo() {
  const user = await requireUser();
  if (user) return user;
  if (process.env.DEMO_MODE !== "1") return null;
  return prisma.user.findFirst({ include: { organization: true } });
}
