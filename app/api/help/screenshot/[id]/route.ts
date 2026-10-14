import {helpActor} from '@/lib/help-server';
import {db} from '@/lib/database';
import {failed,CourseError} from '@/lib/course-admin';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const actor=await helpActor(),{id}=await params;
 const row=await db().prepare('SELECT screenshot FROM help_requests WHERE id=? AND (? OR requester_key=?)').bind(id,actor.manage,actor.key).first<{screenshot:string|null}>();
 if(!row?.screenshot)throw new CourseError('Help attachment unavailable.',404);
 return new Response(Buffer.from(row.screenshot.split(',')[1],'base64'),{headers:{'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="help-screenshot.jpg"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
}catch(e){return failed(e);}}
