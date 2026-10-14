import {currentTenant} from '@/lib/tenant-context';
export const dynamic='force-dynamic';
export async function GET(request:Request){const b=await currentTenant();if(b.logo_url.startsWith('/branding/'))return Response.redirect(new URL(b.logo_url,request.url));const m=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(b.logo_url);if(!m)return new Response('Logo not found',{status:404});return new Response(Buffer.from(m[2],'base64'),{headers:{'Content-Type':m[1],'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});}
