import {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {db} from '@/lib/database';
import {nativeAuthor,nativeMedia} from '@/lib/native-authoring';
import {readEvidenceForm,evidenceFile,evidenceStore,evidenceContext} from '@/lib/assessment-evidence';
import {json,failed,CourseError} from '@/lib/course-admin';
export const dynamic='force-dynamic';
export async function POST(r:NextRequest){try{
 const courseId=r.nextUrl.searchParams.get('courseId')||'',actor=await nativeAuthor(courseId,r);
 if((await nativeMedia(courseId)).length>=200)throw new CourseError('This course has reached its file limit.');
 const form=await readEvidenceForm(r),file=form.get('file');
 if(!(file instanceof File)||file.size<1||file.size>3*1024*1024)throw new CourseError('Choose a file up to 3 MB.');
 const data=await file.arrayBuffer(),prefix=new TextDecoder().decode(data.slice(0,32));
 let bytes:ArrayBuffer,mime:string,filename:string;
 if(prefix.slice(4,8)==='ftyp'&&/isom|mp42|mp41|avc1/.test(prefix.slice(8))){bytes=data;mime='video/mp4';filename=(file.name.replace(/[\u0000-\u001f\u007f/\\<>"]/g,'_').replace(/\.[^.]*$/,'').slice(0,120)||'video')+'.mp4';}
 else {const f=await evidenceFile(file);bytes=f.bytes;mime=f.mime;filename=f.filename;
  if(mime.startsWith('image/')){const clean=await sharp(Buffer.from(bytes),{limitInputPixels:20000000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp().toBuffer();bytes=Uint8Array.from(clean).buffer;mime='image/webp';filename=f.filename.replace(/\.[^.]*$/,'.webp');}
 }
 if(bytes.byteLength>3*1024*1024)throw new CourseError('Choose a file up to 3 MB.',413);
 const id=crypto.randomUUID(),context=evidenceContext(),sha=createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
 await (await evidenceStore(context,true)).set(`native/${id}`,bytes,{onlyIfNew:true});
 await db().prepare('INSERT INTO native_media(id,course_id,filename,mime_type,size,sha256,storage_context,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,courseId,filename,mime,bytes.byteLength,sha,context,actor.email).run();
 return json({media:await nativeMedia(courseId)});
}catch(e){return failed(e);}}
