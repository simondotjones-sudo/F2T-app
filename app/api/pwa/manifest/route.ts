import {currentTenant} from '@/lib/tenant-context';
import {pwaManifest} from '@/lib/pwa';
export const dynamic='force-dynamic';
export async function GET(){
 return Response.json(pwaManifest(await currentTenant()),{headers:{'Content-Type':'application/manifest+json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
