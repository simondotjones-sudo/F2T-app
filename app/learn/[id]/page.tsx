import NativePlayer from './native-player';
import {db} from '@/lib/database';
import Player from './player';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {learnerForSession} from '@/lib/server';
import {getCourseAdministrator} from '@/lib/course-permissions';
import './player.css';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{preview?:string}>}){
  const preview=(await searchParams).preview==='1';
  const learner=await learnerForSession((await cookies()).get('primark_session')?.value);
  if(preview ? !await getCourseAdministrator() : !learner || learner.admin_only)redirect('/');
  const id=(await params).id;
  const course=await db().prepare('SELECT delivery_type FROM courses WHERE id=?').bind(id).first<{delivery_type:string}>();
  return course?.delivery_type==='native'?<NativePlayer courseId={id} preview={preview}/>:<Player courseId={id} preview={preview}/>;
}
