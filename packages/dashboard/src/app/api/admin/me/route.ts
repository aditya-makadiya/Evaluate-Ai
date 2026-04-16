import { NextResponse } from 'next/server';
import { getAdminAuthContext } from '@/lib/admin-auth';

export async function GET() {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    userId: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    platformRole: ctx.platformRole,
  });
}
