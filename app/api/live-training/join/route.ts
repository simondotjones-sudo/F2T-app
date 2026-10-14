import type {NextRequest} from 'next/server';
import {failed,CourseError} from '@/lib/course-admin';
import {liveLearnerRecord} from '@/lib/live-learner';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 const r=await liveLearnerRecord(request);
 if(r.format!=='webinar'||r.session_status!=='scheduled'||r.attendance!=='assigned'||Date.parse(r.starts_at)>Date.now()+1800000||Date.parse(r.ends_at)<Date.now())throw new CourseError('This session is no longer available.',409);
 const url=new URL(r.location);if(url.protocol!=='https:'||url.username||url.password)throw new CourseError('This session is no longer available.',409);
 return new Response(null,{status:302,headers:{Location:url.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(e){return failed(e);}}
