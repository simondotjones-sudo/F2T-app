import {NextRequest} from 'next/server';
import {allowLoginAttempt} from '@/lib/admin-auth';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {sameOrigin} from '@/lib/request-origin';
import {operatorEmail,redeemPlatformCode} from '@/lib/platform-operators';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{
 if(!sameOrigin(request))throw new CourseError('Please use the sign-in page.',403);
 const body=await bodyJson(request,4096);
 if(!body||typeof body!=='object'||Array.isArray(body))throw new CourseError('Invalid request.');
 const email=operatorEmail(body.email);
 if(!await allowLoginAttempt('platform-code:'+email,5))throw new CourseError('Too many attempts. Try again in 15 minutes.',429);
 await redeemPlatformCode(email,body.code,body.password);
 // A separate password login avoids issuing a session against a concurrently changed credential.
 return json({ok:true});
}catch(e){return failed(e);}}
