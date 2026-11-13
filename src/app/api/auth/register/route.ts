import { AppError } from '@/lib/errors';
import { route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public self-registration is disabled. Administrators create accounts via POST /api/admin/users.
export const POST = route(async () => {
  throw new AppError(403, 'FORBIDDEN', 'Public registration is not available. Contact your administrator to create an account.');
});
