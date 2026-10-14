import {currentTenant} from '@/lib/tenant-context';
import {renderPwaIcon} from '@/lib/pwa-icon';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const size=Number(new URL(request.url).searchParams.get('size')||192);
 if(![180,192,512].includes(size))return new Response(null,{status:400});
 const bytes=await renderPwaIcon(await currentTenant(),size);
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
