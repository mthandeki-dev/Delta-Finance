import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The CredentialsProvider with bcrypt.compare lives in src/lib/auth.ts.
// A shared config lets the app verify the same JWT sessions server-side.
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
