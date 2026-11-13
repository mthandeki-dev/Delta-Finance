import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/');
  // If they don't need to change password, send them to the dashboard
  if (!user.requirePasswordChange) redirect('/dashboard');

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="card">
        <h1 className="text-xl font-semibold">Change your password</h1>
        <p className="hint mt-1">
          Your administrator has set a temporary password. Please choose a new password before continuing.
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
