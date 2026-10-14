import {isDeepStrictEqual} from 'node:util';
import {db} from './database';
import {CourseError} from './course-error';
import {requireCourseAdministrator,requireEditableCourse} from './course-permissions';
import {requireFeature} from './features';
import {validateContent,mediaIds,type NativeContent} from './native-content';
import {evidenceStore} from './assessment-evidence';
import type {NextRequest} from 'next/server';
export type NativeMedia={id:string;course_id:string;filename:string;mime_type:string;size:number;sha256:string;storage_context:string;created_by:string};
export async function nativeAuthor(courseId:string,request?:NextRequest){
 const actor=await requireCourseAdministrator(request);await requireFeature('course_authoring');await requireEditableCourse(actor,courseId);
 // A shared copy is never a new master, including for a client platform admin.
 if(await db().prepare('SELECT 1 FROM catalogue_subscriptions WHERE course_id=?').bind(courseId).first())throw new CourseError('Use the original master course.',403);
 const c=await db().prepare("SELECT * FROM courses WHERE id=? AND delivery_type='native'").bind(courseId).first();
 if(!c)throw new CourseError('Course not found.',404);
 return actor;
}
export async function nativeMedia(courseId:string){return (await db().prepare('SELECT * FROM native_media WHERE course_id=? ORDER BY created_at').bind(courseId).all<NativeMedia>()).results;}
export async function checkedContent(value:unknown,courseId:string,publish=false){
 let content:NativeContent;try{content=validateContent(value,publish);}catch(e){throw new CourseError((e as Error).message);}
 const files=await nativeMedia(courseId);
 for(const lesson of content.lessons)for(const b of lesson.blocks)if('mediaId' in b&&b.mediaId){
  const file=files.find(f=>f.id===b.mediaId);
  if(!file||(b.type==='image'?!file.mime_type.startsWith('image/'):b.type==='video'?file.mime_type!=='video/mp4':file.mime_type!=='application/pdf'))throw new CourseError('Choose a valid file from this course.');
 }
 if(publish)for(const id of mediaIds(content)){const f=files.find(f=>f.id===id)!;if(!await (await evidenceStore(f.storage_context)).getMetadata(`native/${id}`))throw new CourseError('A course file is unavailable. Upload it again.');}
 return content;
}
export async function publishNative(tx:{query:(sql:string,args?:unknown[])=>Promise<{rows:Record<string,any>[]}>},courseId:string,revision:unknown){
 const draft=(await tx.query('SELECT * FROM native_drafts WHERE course_id=$1 FOR UPDATE',[courseId])).rows[0];
 if(!draft||draft.revision!==revision)throw new CourseError('Course content changed. Reload the builder before publishing.',409);
 const content=validateContent(draft.content,true);
 const old=(await tx.query('SELECT p.native_json,p.id FROM courses c JOIN course_packages p ON p.id=c.package_id WHERE c.id=$1',[courseId])).rows[0];
 if(isDeepStrictEqual(old?.native_json,content))return;
 const id=crypto.randomUUID(),stamp=new Date().toISOString();
 // Package identity is also the existing immutable assignment-content identity.
 const scos=content.lessons.filter(l=>l.required).map(l=>({id:l.id,title:l.title,href:'native',mastery:'',launchData:''}));
 await tx.query("INSERT INTO course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at,native_json) VALUES($1,$2,'Native course','ready',$3,0,0,$4,$5)",[id,courseId,JSON.stringify(scos),stamp,JSON.stringify(content)]);
 await tx.query('UPDATE courses SET package_id=$2,lesson_count=$3 WHERE id=$1',[courseId,id,content.lessons.length]);
}
