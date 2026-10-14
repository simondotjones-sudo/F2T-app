import {NextRequest,NextResponse} from 'next/server';
import {canonicalClientSlug,DEFAULT_BRAND} from './lib/tenant-types';
// Portal selection is public; it never grants access. Sessions live in each
// client's schema. Request headers are overwritten to prevent spoofing.
export function proxy(request:NextRequest){
 const url=request.nextUrl;const selection=url.searchParams.get('client');
 const selected=selection?canonicalClientSlug(selection):null;
 const clientCookie=request.cookies.get('lms_client')?.value;
 const slug=selected||canonicalClientSlug(clientCookie||(url.pathname.startsWith('/verify/')?'primark':DEFAULT_BRAND.slug));
 const expected=request.headers.get('x-lms-expected-client');
 if(expected&&expected!==slug)return NextResponse.json({error:'The active client has changed. Reload this page before continuing.'},{status:409});
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length>60)return new NextResponse('Client portal not found',{status:404});
 const h=new Headers(request.headers);h.delete('x-lms-client');h.set('x-lms-client',slug);
 const response=NextResponse.next({request:{headers:h}});
 if(!url.pathname.startsWith('/api/')&&((selected&&clientCookie!==selected)||(clientCookie&&clientCookie!==slug))){
  response.cookies.set('lms_client',slug,{httpOnly:true,secure:url.protocol==='https:',sameSite:'lax',path:'/'});
  // Old learner sessions cannot be carried into a different portal.
  response.cookies.delete('primark_session');h.delete('cookie');
  // Preserve only the global operator session when selecting a new client.
  const admin=request.cookies.get('primark_admin')?.value;
  h.set('cookie',`lms_client=${slug}${admin?`; primark_admin=${admin}`:''}`);
  const next=NextResponse.next({request:{headers:h}});next.headers.set('Cache-Control','private, no-store');for(const c of response.cookies.getAll())next.cookies.set(c);return next;
 }
 response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/((?!sw.js|offline.html|_next/static|_next/image|branding/|course-images/|fonts/|favicon.svg).*)']};
