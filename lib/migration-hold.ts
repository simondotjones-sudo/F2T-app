import {runtimeEnv} from './runtime-env';

export function migrationHoldEnabled() {
  return runtimeEnv('LMS_MIGRATION_HOLD') === 'enabled';
}

export class MigrationHoldError extends Error {
  constructor() { super('This installation is temporarily paused for migration.'); }
}

export function assertMigrationOpen() {
  if (migrationHoldEnabled()) throw new MigrationHoldError();
}

export function migrationHoldResponse(request: Request) {
  const headers = {'Cache-Control':'private, no-store', 'Retry-After':'300', 'X-Robots-Tag':'noindex'};
  const api = new URL(request.url).pathname.startsWith('/api/');
  const body = api ? JSON.stringify({error:'This installation is temporarily unavailable. Please try again shortly.'})
    : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EazySAFE — temporarily unavailable</title><body style="margin:0;background:#f5f7f8;color:#17242b;font:18px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh"><main style="max-width:36rem;padding:2rem"><h1>We’re preparing your learning platform.</h1><p>Please check back shortly.</p></main></body></html>';
  return new Response(request.method === 'HEAD' ? null : body, {status:503,headers:{...headers,'Content-Type':api?'application/json; charset=utf-8':'text/html; charset=utf-8'}});
}
