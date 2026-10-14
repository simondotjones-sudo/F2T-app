import type {NextRequest} from 'next/server';
import {db,inTransaction} from '@/lib/database';
import {CourseError,failed,json} from '@/lib/course-admin';
import {externalActor,externalRecord,revalidateExternalActor} from '@/lib/external-training';
import {requireFeature} from '@/lib/features';
import {evidenceContext,evidenceFile,evidenceStore,readEvidenceForm,MAX_EVIDENCE_FILES} from '@/lib/assessment-evidence';
import {tenantFileKey} from '@/lib/tenant-files';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){try{
 const a=await externalActor(request,request.nextUrl.searchParams.get('admin')==='1');await requireFeature('external_training');if(!a.admin)await requireFeature('external_submissions');
 const record=request.nextUrl.searchParams.get('record')||'';
 await externalRecord(a,record);const form=await readEvidenceForm(request),file=form.get('file');if(!(file instanceof File))throw new CourseError('Choose an evidence file.');
 const value=await evidenceFile(file);if(!['application/pdf','image/jpeg','image/png'].includes(value.mime))throw new CourseError('Use a PDF, JPEG or PNG file.');
 const id=crypto.randomUUID(),context=evidenceContext(),key=await tenantFileKey('external/'+id),store=await evidenceStore(context,true);
 await inTransaction(async tx=>{
  await revalidateExternalActor(a);const r=await externalRecord(a,record,true);if(r.status!=='pending')throw new CourseError('Only pending records can be edited.',409);
  const count=(await tx.query('SELECT count(*)::int n FROM external_training_evidence WHERE record_id=$1',[record])).rows[0];if(Number(count.n)>=MAX_EVIDENCE_FILES)throw new CourseError('Choose up to five evidence files.');
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[a.email]);
  await tx.query('INSERT INTO external_training_evidence(id,record_id,filename,mime_type,size,sha256,storage_context,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,record,value.filename,value.mime,file.size,value.sha256,context,a.email]);
 });
 const stored=await store.set(key,value.bytes,{onlyIfNew:true});if(!stored.modified)throw new CourseError('Evidence is not available.',409);
 await inTransaction(async tx=>{await revalidateExternalActor(a);const r=await externalRecord(a,record,true);if(r.status!=='pending')throw new CourseError('Only pending records can be edited.',409);await tx.query("SELECT set_config('app.audit_actor',$1,true)",[a.email]);await tx.query("UPDATE external_training_evidence SET state='ready' WHERE id=$1",[id]);await tx.query('UPDATE external_training SET revision=revision+1 WHERE id=$1',[record]);});
 return json({id},201);
}catch(e){return failed(e);}}
