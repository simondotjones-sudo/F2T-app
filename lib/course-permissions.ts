import type {NextRequest} from 'next/server';
import {getUserAdministrator} from '@/lib/user-administration';
import {featureEnabled} from '@/lib/features';
import {CourseError} from '@/lib/course-admin';
import {db} from '@/lib/database';
import {sameOrigin} from '@/lib/shot-server';

export async function getCourseAdministrator(){
 const actor=await getUserAdministrator();
 return actor&&(actor.platformAdmin||(actor.access.scope==='organisation'&&await featureEnabled('client_course_management')))?actor:null;
}
export async function requireCourseAdministrator(request?:NextRequest){
 const actor=await getCourseAdministrator();
 if(!actor)throw new CourseError('Course management access is required.',403);
 if(request&&!sameOrigin(request))throw new CourseError('Please make this change from the course page.',403);
 return actor;
}
export async function requireEditableCourse(actor:{platformAdmin:boolean},id:string){
 if(!actor.platformAdmin&&await db().prepare('SELECT 1 FROM catalogue_subscriptions WHERE course_id=?').bind(id).first())
  throw new CourseError('Shared courses are managed by EazySAFE.',403);
}
