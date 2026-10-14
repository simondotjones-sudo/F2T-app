import type {NextRequest} from 'next/server';
import {getPlatformOperator} from '@/lib/admin-auth';
import {sameOrigin} from '@/lib/request-origin';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {clientSettings,saveClientSettings} from '@/lib/client-edit';
import type {ClientEdit} from '@/lib/client-edit-types';
export const dynamic='force-dynamic';
async function actor(request:NextRequest,write=false){
 const actor=await getPlatformOperator();if(!actor)throw new CourseError('Platform administrator access is required.',403);
 if(write&&!sameOrigin(request))throw new CourseError('Please use the Clients page.',403);
 const id=Number(request.nextUrl.searchParams.get('id'));if(!Number.isSafeInteger(id)||id<1)throw new CourseError('Choose a client.');
 return {actor,id};
}
export async function GET(request:NextRequest){try{const {id}=await actor(request);return json(await clientSettings(id));}catch(e){return failed(e);}}
export async function PATCH(request:NextRequest){try{const {actor:a,id}=await actor(request,true);return json(await saveClientSettings(id,await bodyJson(request,4000000) as unknown as ClientEdit,a.email));}catch(e){if((e as {code?:string}).code==='23505')return json({error:'Check site names, countries and unique site codes.'},409);return failed(e);}}
