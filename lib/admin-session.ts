import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, sessionCredentialFingerprint, credentials, safeReturnTo } from '@/lib/admin-auth';
import {platformDb} from '@/lib/control-database';
import { db, hash, randomToken, now } from '@/lib/server';
import { isSecureRequest } from '@/lib/request-origin';

// Call only after checking the admin password (or redeeming a code) and rate limit.
export async function createAdminSession(request: NextRequest, returnTo: unknown, email=credentials()?.email, authenticatedFingerprint?:string) {
  if(!email)throw new Error('Missing platform account');
  const token = randomToken(), expires = new Date(Date.now() + 8 * 3600000);
  const currentFingerprint = await sessionCredentialFingerprint(email);
  const fingerprint = authenticatedFingerprint??currentFingerprint;
  if(!fingerprint||fingerprint!==currentFingerprint)throw new Error('Platform credentials changed during sign-in');
  const statements = [
    platformDb().prepare('DELETE FROM admin_sessions WHERE expires_at<? OR (email=? AND credential_hash<>?)').bind(now(), email, fingerprint),
    platformDb().prepare('INSERT INTO admin_sessions(token_hash,email,credential_hash,expires_at) VALUES(?,?,?,?)').bind(await hash(token), email, fingerprint, expires.toISOString()),
  ];
  const learnerToken = request.cookies.get('primark_session')?.value;
  const previousAdmin = request.cookies.get(ADMIN_COOKIE)?.value;
  if (learnerToken) await db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(learnerToken)).run();
  if (previousAdmin) statements.push(platformDb().prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await hash(previousAdmin)));
  await platformDb().batch(statements);
  const response = NextResponse.json({ ok: true, returnTo: returnTo ? safeReturnTo(returnTo) : "/?view=report" });
  response.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, secure: isSecureRequest(request), sameSite: 'strict', path: '/', expires });
  response.cookies.delete('primark_session');
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
