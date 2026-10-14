import {isDeepStrictEqual} from 'node:util';
import {NextRequest} from 'next/server';
import {db,inTransaction} from '@/lib/database';
import {nativeAuthor,nativeMedia,checkedContent} from '@/lib/native-authoring';
import {bodyJson,json,failed,CourseError} from '@/lib/course-admin';
export const dynamic='force-dynamic';
export async function GET(r:NextRequest){try{
 const id=r.nextUrl.searchParams.get('courseId')||'';await nativeAuthor(id);
 const draft=await db().prepare('SELECT * FROM native_drafts WHERE course_id=?').bind(id).first();
 return json({draft,media:await nativeMedia(id)});
}catch(e){return failed(e);}}
export async function POST(r:NextRequest){try{
 const b=await bodyJson(r),actor=await nativeAuthor(b.courseId,r),content=await checkedContent(b.content,b.courseId);
 const draft=await inTransaction(async tx=>{
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
  const result=await tx.query('UPDATE native_drafts SET content=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE course_id=$1 AND revision=$4 RETURNING *',[b.courseId,JSON.stringify(content),actor.email,b.revision]);
  if(!result.rows.length){
   const current=(await tx.query('SELECT * FROM native_drafts WHERE course_id=$1',[b.courseId])).rows[0];
   // A lost response may be retried safely when the server already has this exact draft.
   if(current&&isDeepStrictEqual(current.content,content))return current;
   throw new CourseError('Course content changed in another session. Reload before saving.',409);
  }
  return result.rows[0];
 });return json({draft});
}catch(e){return failed(e);}}
