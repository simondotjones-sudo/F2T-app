import {db} from './database';
import {CourseError} from './course-error';
import {canAccessCourse,assignedCourses} from './course-access';
import type {NativeContent} from './native-content';
import type {EnrolledPerson} from './course-catalogue';
export async function nativeAssignment(learner:EnrolledPerson,courseId:string){
 const course=(await assignedCourses(learner)).find(c=>c.id===courseId);
 if(!course||!await canAccessCourse(course,learner))throw new CourseError('This course is not assigned to you.',403);
 const row=await db().prepare(`SELECT h.id,h.package_id,h.quiz_json,p.native_json FROM course_assignments a JOIN assignment_history h ON h.id=a.history_id JOIN course_packages p ON p.id=h.package_id WHERE a.learner_id=? AND a.course_id=? AND p.native_json IS NOT NULL`).bind(learner.id,courseId).first<{id:string;package_id:string;quiz_json:unknown;native_json:NativeContent}>();
 if(!row)throw new CourseError('Course not found.',404);
 return {...row,title:course.title};
}
export async function nativeState(assignmentId:string){
 const events=(await db().prepare("SELECT DISTINCT lesson_id,block_id,kind FROM native_events WHERE assignment_id=? AND kind IN ('lesson_complete','acknowledgement','practice','content_complete')").bind(assignmentId).all<{lesson_id:string;block_id:string;kind:string;}>()).results;
 const session=await db().prepare('SELECT lesson_id FROM native_sessions WHERE assignment_id=?').bind(assignmentId).first<{lesson_id:string}>();
 return {completed:events.filter(e=>e.kind==='lesson_complete').map(e=>e.lesson_id),acknowledged:events.filter(e=>e.kind==='acknowledgement').map(e=>e.block_id),practised:events.filter(e=>e.kind==='practice').map(e=>e.block_id),lessonId:session?.lesson_id,contentComplete:events.some(e=>e.kind==='content_complete')};
}
export function unlockedLesson(content:NativeContent,lessonId:string,completed:string[]){
 const index=content.lessons.findIndex(l=>l.id===lessonId);
 return index>=0&&(!content.sequential||content.lessons.slice(0,index).filter(l=>l.required).every(l=>completed.includes(l.id)));
}
