import type {NextRequest} from 'next/server';
import {bodyJson,failed,json} from '@/lib/course-admin';
import {requireUserAdministrator} from '@/lib/user-administration';
import {importSites} from '@/lib/site-import';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{const actor=await requireUserAdministrator(request);return json(await importSites(await bodyJson(request,500000),actor));}catch(e){return failed(e);}}
