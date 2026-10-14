import {byteRange,InvalidRange} from '@/lib/storage';
import {NextRequest} from 'next/server';
import {db} from '@/lib/database';
import {currentLearner} from '@/lib/server';
import {nativeAuthor,type NativeMedia} from '@/lib/native-authoring';
import {nativeAssignment} from '@/lib/native-learning';
import {mediaIds,type NativeContent} from '@/lib/native-content';
import {evidenceStore} from '@/lib/assessment-evidence';
import {failed,CourseError} from '@/lib/course-admin';
export const dynamic='force-dynamic';
export async function GET(r:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,courseId=r.nextUrl.searchParams.get('courseId')||'';
 const f=await db().prepare('SELECT * FROM native_media WHERE id=? AND course_id=?').bind(id,courseId).first<NativeMedia>();
 if(!f)throw new CourseError('File not found.',404);
 if(r.nextUrl.searchParams.get('preview')==='1')await nativeAuthor(courseId);
 else{
  const learner=await currentLearner(r);if(!learner)throw new CourseError('Sign in to launch this course.',401);
  const a=await nativeAssignment(learner,courseId);
  if(!mediaIds(a.native_json as NativeContent).includes(id))throw new CourseError('File not found.',404);
 }
 const bytes=await (await evidenceStore(f.storage_context)).get(`native/${id}`,{type:'arrayBuffer'});
 if(!bytes)throw new CourseError('File not found.',404);
 const headers:Record<string,string>={'Content-Type':f.mime_type,'Content-Disposition':`${f.mime_type==='application/pdf'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes'};
 let range;try{range=byteRange(r.headers.get('range'),bytes.byteLength);}catch(e){if(e instanceof InvalidRange)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${bytes.byteLength}`}});throw e;}
 if(range){headers['Content-Range']=`bytes ${range.offset}-${range.offset+range.length-1}/${bytes.byteLength}`;headers['Content-Length']=String(range.length);return new Response(bytes.slice(range.offset,range.offset+range.length),{status:206,headers});}
 headers['Content-Length']=String(bytes.byteLength);return new Response(bytes,{headers});
}catch(e){return failed(e);}}
