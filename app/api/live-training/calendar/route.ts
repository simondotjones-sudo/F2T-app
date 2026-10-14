import type {NextRequest} from 'next/server';
import {failed,CourseError} from '@/lib/course-admin';
import {liveLearnerRecord,calendarText,foldCalendar} from '@/lib/live-learner';
import {currentTenant} from '@/lib/tenant-context';
import {portalUrl} from '@/lib/tenant-types';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 const r=await liveLearnerRecord(request),tenant=await currentTenant();
 if(r.attendance==='cancelled'||r.session_status==='cancelled')throw new CourseError('This session is no longer available.',409);
 const stamp=(v:string)=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const url=new URL(portalUrl(tenant.slug,'/?courses=1'),request.url).href;
 const body=foldCalendar(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//EazySAFE//Live Training//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${tenant.id}-${r.id}@eazysafe-lms`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(r.starts_at)}`,`DTEND:${stamp(r.ends_at)}`,`SUMMARY:${calendarText(r.title)}`,`DESCRIPTION:${calendarText(r.trainer+'\n'+r.time_zone+'\n'+url)}`,`LOCATION:${calendarText(r.format==='classroom'?r.location:url)}`,'END:VEVENT','END:VCALENDAR']);
 return new Response(body,{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="training-session.ics"','Cache-Control':'private, no-store'}});
 }catch(e){return failed(e);}}
