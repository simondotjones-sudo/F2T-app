import type {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
import {db} from '@/lib/database';
import {CourseError,failed} from '@/lib/course-admin';
import {externalActor,externalRecord} from '@/lib/external-training';
import {evidenceStore} from '@/lib/assessment-evidence';
import {tenantFileKey} from '@/lib/tenant-files';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const a=await externalActor(request,request.nextUrl.searchParams.get('admin')==='1'),{id}=await params;
 const row=await db().prepare("SELECT * FROM external_training_evidence WHERE id=? AND state='ready'").bind(id).first<{record_id:string;storage_context:string;size:number;sha256:string;mime_type:string;filename:string}>();if(!row)throw new CourseError('Evidence is not available.',404);
 if(request.nextUrl.searchParams.get('assessor')==='1'){
  const permitted=await db().prepare(`SELECT 1 FROM external_training e JOIN training_recognitions r ON r.external_record_id=e.id JOIN assignment_history h ON h.id=r.assignment_id JOIN learners l ON l.id=h.learner_id JOIN assessor_grants g ON g.course_id=h.course_id WHERE e.id=? AND e.status='approved' AND g.learner_id=? AND g.active AND (g.expires_on IS NULL OR g.expires_on>=CURRENT_DATE) AND (g.site_id='*' OR g.site_id=l.store_id) AND h.learner_id<>?`).bind(row.record_id,a.id,a.id).first();if(!permitted)throw new CourseError('Evidence is not available.',404);
 }else await externalRecord(a,row.record_id);
 const bytes=await (await evidenceStore(row.storage_context)).get(await tenantFileKey('external/'+id),{type:'arrayBuffer'});
 if(!bytes||bytes.byteLength!==row.size||createHash('sha256').update(new Uint8Array(bytes)).digest('hex')!==row.sha256)throw new CourseError('Evidence could not be downloaded. Please try again.',503);
 return new Response(bytes,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.size),'Content-Disposition':`attachment; filename="${row.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"sandbox; default-src 'none'"}});
}catch(e){return failed(e);}}
