import type {NextRequest} from 'next/server';
import {authenticateHr,processHrEvent} from '@/lib/hr-integration';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{
 if(!request.nextUrl.searchParams.get('client'))throw new CourseError('Specify the client portal slug in ?client=.');
 const key=await authenticateHr(request),body=await bodyJson(request,100000);
 if(!body||!Array.isArray(body.employees)||body.employees.length<1||body.employees.length>25||Object.keys(body).some(k=>!['employees','dryRun'].includes(k))||(body.dryRun!==undefined&&typeof body.dryRun!=='boolean'))throw new CourseError('Send 1–25 employees and an optional boolean dryRun.');
 const results=[];
 for(const row of body.employees){try{results.push(await processHrEvent(key,row,body.dryRun===true));}catch(e){results.push({eventId:row?.eventId,status:'failed',error:e instanceof CourseError?e.message:'Unable to process this event. Retry with the same eventId.'});}}
 return json({dryRun:body.dryRun===true,results});
 }catch(e){return failed(e);}}
