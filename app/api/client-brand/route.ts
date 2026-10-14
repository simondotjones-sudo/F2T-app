import {currentTenant} from '@/lib/tenant-context';
import {publicBrand} from '@/lib/tenant-types';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(publicBrand(await currentTenant()),{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Client portal not found'},{status:404});}}
