import type {NextRequest} from 'next/server';
import {currentLearner,db} from './server';
import {CourseError} from './course-admin';
import {liveColumns,liveJoins} from './live-training';
import type {LiveRecord} from './live-training-types';
export async function liveLearnerRecord(request:NextRequest){
 const learner=await currentLearner(request);if(!learner||learner.admin_only)throw new CourseError('Use your personal learner account for training.',403);
 const id=request.nextUrl.searchParams.get('id');
 const row=await db().prepare(`SELECT ${liveColumns} ${liveJoins} WHERE e.id=? AND e.learner_id=?`).bind(id,learner.id).first<LiveRecord>();
 if(!row)throw new CourseError('This session is no longer available.',404);return row;
}
export function calendarText(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
export function foldCalendar(lines:string[]){return lines.map(line=>{const rows:string[]=[];let s='',bytes=0;for(const c of line){const n=Buffer.byteLength(c);if(bytes+n>73){rows.push(s);s=' ';bytes=1;}s+=c;bytes+=n;}rows.push(s);return rows.join('\r\n');}).join('\r\n')+'\r\n';}
