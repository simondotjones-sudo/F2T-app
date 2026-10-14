import {db} from '@/lib/database';
import {liveAdmin,liveManager} from '@/lib/live-training';
import {failed,CourseError} from '@/lib/course-admin';
import {evidenceStore} from '@/lib/assessment-evidence';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const actor=await liveAdmin();if(!liveManager(actor))throw new CourseError('Organisation admin access is required.',403);
 const r=await db().prepare('SELECT * FROM live_evidence WHERE id=?').bind((await params).id).first<any>();if(!r)throw new CourseError('Evidence is not available.',404);
 const bytes=await (await evidenceStore(r.storage_context)).get(`live/${r.session_id}/${r.id}`,{type:'arrayBuffer'});if(!bytes)throw new CourseError('Evidence is not available.',404);
 return new Response(bytes,{headers:{'Content-Type':r.mime_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return failed(e);}}
