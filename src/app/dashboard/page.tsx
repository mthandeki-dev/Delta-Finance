import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/Dashboard';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/');
  return <Dashboard />;
}
