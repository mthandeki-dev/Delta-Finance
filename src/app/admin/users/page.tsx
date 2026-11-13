import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { UserManagement } from '@/components/UserManagement';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/');
  if (user.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <a href="/dashboard" className="btn-ghost">
            ← Dashboard
          </a>
        </div>
      </header>
      <main id="main">
        <UserManagement />
      </main>
    </div>
  );
}
