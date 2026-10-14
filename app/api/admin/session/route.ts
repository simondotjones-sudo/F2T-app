import {platformDb} from '@/lib/control-database';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, allowLoginAttempt, passwordMatches, sessionCredentialFingerprint } from '@/lib/admin-auth';
import { createAdminSession } from '@/lib/admin-session';
import { db, hash } from '@/lib/server';
import { sameOrigin } from '@/lib/request-origin';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Please use the sign-in page.' }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === 'logout') {
      const token = request.cookies.get(ADMIN_COOKIE)?.value;
      const learnerToken = request.cookies.get('primark_session')?.value;
      const changes = [];
      if (token) await platformDb().prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hash(token)).run();
      if (learnerToken) changes.push(db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(learnerToken)));
      await db().batch(changes);
      const response = NextResponse.json({ ok: true });
      response.cookies.delete(ADMIN_COOKIE); response.cookies.delete('primark_session');
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if (!email || email.length>254 || typeof body.password !== 'string' || body.password.length > 1024)
      return NextResponse.json({ error: 'Those sign-in details did not match.' }, { status: 401 });
    if (!await allowLoginAttempt('platform-admin:'+email)) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
    const fingerprint=await sessionCredentialFingerprint(email);
    if (!await passwordMatches(email, body.password))
      return NextResponse.json({ error: 'Those sign-in details did not match.' }, { status: 401 });
    return await createAdminSession(request, body.returnTo,email,fingerprint);
  } catch (error) { console.error('Admin sign-in failed', error); return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503 }); }
}
