import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';

export async function GET() {
  try {
    const ctx = await getAuthContext();

    if (!ctx) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: ctx.userId,
        email: ctx.email,
        name: ctx.name,
        teamId: ctx.teamId,
        teamName: ctx.teamName,
        teamCode: ctx.teamCode,
        role: ctx.role,
        memberId: ctx.memberId,
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
