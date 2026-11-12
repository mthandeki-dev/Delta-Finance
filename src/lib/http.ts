import { NextResponse, type NextRequest } from 'next/server';
import { AppError } from './errors';

export const ok = (data: unknown, status = 200, headers?: HeadersInit) => NextResponse.json(data, { status, headers });

/** Wraps a route handler with uniform, non-leaky error responses. */
export function route<Ctx = unknown>(handler: (req: NextRequest, ctx: Ctx) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AppError) {
        return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
      }
      console.error(JSON.stringify({ level: 'error', scope: 'api', path: req.nextUrl.pathname, error: String(e), stack: (e as Error)?.stack }));
      return NextResponse.json(
        { error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } },
        { status: 500 },
      );
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    const body = await req.json();
    if (typeof body !== 'object' || body === null) throw new Error();
    return body as T;
  } catch {
    throw new AppError(400, 'BAD_JSON', 'Request body must be a JSON object.');
  }
}

export function str(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new AppError(400, 'VALIDATION', `${field} is required (max ${max} characters).`);
  }
  return value.trim();
}
