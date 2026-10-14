import type {NextRequest} from 'next/server';
import {db,inTransaction} from '@/lib/database';
import {liveAdmin,liveManager,recheckLiveActor} from '@/lib/live-training';
import {failed,json,CourseError} from '@/lib/course-admin';
import {readEvidenceForm,evidenceFile,evidenceStore,evidenceContext} from '@/lib/assessment-evidence';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{const actor=await liveAdmin();if(!liveManager(actor))throw new CourseError('Organisation admin access is required.',403);return json({files:(await db().prepare('SELECT id,filename,size,uploaded_at FROM live_evidence WHERE session_id=? ORDER BY uploaded_at').bind(request.nextUrl.searchParams.get('session')).all()).results});}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await liveAdmin(request);if(!liveManager(actor))throw new CourseError('Organisation admin access is required.',403);
 const form=await readEvidenceForm(request),file=form.get('file'),session=form.get('session');if(!(file instanceof File)||typeof session!=='string')throw new CourseError('Choose an evidence file.');
 const f=await evidenceFile(file),id=crypto.randomUUID(),context=evidenceContext(),store=await evidenceStore(context,true);
 await inTransaction(async tx=>{
  await recheckLiveActor(tx,actor);
  if(!(await tx.query('SELECT id FROM live_sessions WHERE id=$1 FOR UPDATE',[session])).rows.length)throw new CourseError('This session is no longer available.',404);
  if(Number((await tx.query('SELECT count(*) AS n FROM live_evidence WHERE session_id=$1',[session])).rows[0].n)>=5)throw new CourseError('A session can have up to five evidence files.');
  await store.set(`live/${session}/${id}`,f.bytes);
  await tx.query('INSERT INTO live_evidence(id,session_id,filename,mime_type,size,sha256,storage_context,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,session,f.filename,f.mime,f.bytes.byteLength,f.sha256,context,actor.email]);
  await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,next_state) VALUES($1,'live_training',$2,'evidence_uploaded',$3)",[actor.email,session,JSON.stringify({id,filename:f.filename,sha256:f.sha256})]);
 });return json({id});
 }catch(e){return failed(e);}}
