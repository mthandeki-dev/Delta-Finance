import bcrypt from 'bcrypt';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { verifyUserPassword } from '@/lib/password';

/** Password authentication uses NextAuth JWT sessions; Xaman keeps its separate signed wallet session. */
export const authOptions: NextAuthOptions = {
  // Supply NEXTAUTH_SECRET on Netlify. SESSION_SECRET supports the existing Docker deployment.
  secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: '/' },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email or username',
      credentials: {
        identifier: { label: 'Email or username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim().toLowerCase();
        const submittedPassword = credentials?.password;
        if (!identifier || identifier.length > 200 || !submittedPassword || submittedPassword.length > 128) {
          return null;
        }

        const user = await prisma.user.findFirst({
          where: { OR: [{ username: identifier }, { email: identifier }] },
        });
        if (!user?.passwordHash) return null;

        // Always use bcrypt.compare for seeded and newly registered accounts.
        // Existing scrypt accounts are migrated to bcrypt on successful sign-in.
        const isBcrypt = /^\$2[aby]\$\d{2}\$/.test(user.passwordHash);
        const verified = isBcrypt
          ? await bcrypt.compare(submittedPassword, user.passwordHash)
          : await verifyUserPassword(user, submittedPassword);
        if (!verified) return null;

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit('USER_SIGNED_IN', { actor: `${user.role.toLowerCase()}:${user.email ?? user.username}` });

        return {
          id: user.id,
          name: user.username ?? user.email ?? 'Delta Finance user',
          // 'admin' is the requested login identifier, but isn't an email address.
          email: user.email?.includes('@') ? user.email : null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === 'string') session.user.id = token.uid;
      return session;
    },
  },
};
