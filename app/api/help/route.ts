import type {NextRequest} from 'next/server';
import {helpActor,helpData,helpSettings,mutateHelp,requestColumns} from '@/lib/help-server';
import {db} from '@/lib/database';
import {failed,json,CourseError} from '@/lib/course-admin';
import {currentTenant} from '@/lib/tenant-context';
export async function GET(request:NextRequest){try{
 const actor=await helpActor(),inbox=request.nextUrl.searchParams.get('inbox')==='1';
 if(inbox&&!actor.manage)throw new CourseError('Help administration access is required.',403);
 const page=Math.max(0,Math.min(100000,Number(request.nextUrl.searchParams.get('page'))||0));
 const requests=(await db().prepare(`SELECT ${requestColumns} FROM help_requests ${inbox?'':'WHERE requester_key=?'} ORDER BY created_at DESC LIMIT 51 OFFSET ?`).bind(...(inbox?[]:[actor.key]),Math.floor(page)*50).all()).results;
 const settings=actor.manage?await helpSettings():null;
 return json({actor,organisation:(await currentTenant()).name,articles:await helpData(actor),settings,requests:requests.slice(0,50),hasMore:requests.length>50});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{return json(await mutateHelp(request));}catch(e){return failed(e);}}
