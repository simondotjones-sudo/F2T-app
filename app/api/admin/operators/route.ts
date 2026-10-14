import {NextRequest} from 'next/server';
import {getPlatformOperator} from '@/lib/admin-auth';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {sameOrigin} from '@/lib/request-origin';
import {changePlatformOperator,listPlatformOperators} from '@/lib/platform-operators';
export const dynamic='force-dynamic';
export async function GET(){try{
 const actor=await getPlatformOperator();if(!actor)throw new CourseError('Platform administrator access is required.',403);
 return json({operators:await listPlatformOperators(),currentEmail:actor.email});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await getPlatformOperator();if(!actor)throw new CourseError('Platform administrator access is required.',403);
 if(!sameOrigin(request))throw new CourseError('Please use the sign-in page.',403);
 const body=await bodyJson(request,4096);
 if(!body||typeof body!=='object'||Array.isArray(body))throw new CourseError('Invalid request.');
 return json(await changePlatformOperator(actor.email,body),body.action==='create'?201:200);
}catch(e){return failed(e);}}
