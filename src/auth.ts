import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isRateLimited, registerFailure, registerSuccess } from "@/lib/rate-limit";

// Állandó költségű összehasonlításhoz nem létező felhasználó esetén
// (érvényes bcrypt hash egy soha nem használt jelszóhoz).
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DFY9C0Zq7bYcVJ0Wl2sQnzZ8bZ3Iy";

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
        const email = String(credentials?.email ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        // A korlátozás kulcsa kisbetűs, hogy a kis-nagybetű váltogatásával
        // ne lehessen megkerülni; a keresés viszont az eredeti címmel megy,
        // mert a tárolt e-mail címek kis-nagybetű-helyesen vannak mentve.
        const key = email.toLowerCase();
        if (await isRateLimited(key)) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.deletedAt) {
          // Nem létező felhasználónál is futtatunk egy hash-összehasonlítást,
          // különben a válaszidőből kiderülne, mely e-mail címek léteznek.
          await compare(password, DUMMY_HASH);
          await registerFailure(key);
          return null;
        }
        const ok = await compare(password, user.passwordHash);
        if (!ok) {
          await registerFailure(key);
          return null;
        }
        await registerSuccess(key);
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
