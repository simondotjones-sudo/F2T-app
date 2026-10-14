import type {NextRequest} from 'next/server';
import {getPlatformOperator} from '@/lib/admin-auth';
import {sameOrigin} from '@/lib/request-origin';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {setupClient} from '@/lib/client-setup';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{
 const actor=await getPlatformOperator();if(!actor)throw new CourseError('Platform administrator access is required.',403);
 if(!sameOrigin(request))throw new CourseError('Please use the Clients page.',403);
 const result=await setupClient(await bodyJson(request,1500000),actor.email);return json(result,result.created?201:200);
}catch(e){if((e as {code?:string}).code==='23505')return json({error:'That portal address is already in use.'},409);if((e as {code?:string}).code==='22023')return json({error:'This setup request changed. Start a new client setup.'},409);return failed(e);}}
