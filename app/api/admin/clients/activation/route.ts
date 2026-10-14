import type {NextRequest} from 'next/server';
import {getPlatformOperator} from '@/lib/admin-auth';
import {sameOrigin} from '@/lib/request-origin';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {setupAdministrator} from '@/lib/client-setup';
export const dynamic='force-dynamic';
async function actor(){const a=await getPlatformOperator();if(!a)throw new CourseError('Platform administrator access is required.',403);return a;}
export async function GET(request:NextRequest){try{const a=await actor();return json(await setupAdministrator(request.nextUrl.searchParams.get('id'),a.email));}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{const a=await actor();if(!sameOrigin(request))throw new CourseError('Please use the Clients page.',403);const b=await bodyJson(request,1000);return json(await setupAdministrator(b?.id,a.email,true));}catch(e){return failed(e);}}
