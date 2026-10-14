import type {NextRequest} from 'next/server';
import {db,currentLearner} from '@/lib/server';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {liveAdmin,liveManager,liveScope,liveColumns,liveJoins,mutateLive} from '@/lib/live-training';
import {activeLearnerSql} from '@/lib/account-type';
import {featureEnabled} from '@/lib/features';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 const p=request.nextUrl.searchParams;
 if(p.get('view')==='mine'){
  const learner=await currentLearner(request);if(!learner||learner.admin_only)throw new CourseError('Use your personal learner account for training.',403);
  const rows=(await db().prepare(`SELECT ${liveColumns},(s.status='scheduled' AND e.attendance='assigned' AND s.starts_at<=now()+interval '30 minutes' AND s.ends_at>=now()) AS can_join ${liveJoins} WHERE e.learner_id=? ORDER BY s.starts_at DESC`).bind(learner.id).all()).results;
  return json({rows:rows.map((r:any)=>({...r,location:r.format==='webinar'?'':r.location}))});
 }
 const actor=await liveAdmin(),manage=liveManager(actor),scope=liveScope(actor),args:unknown[]=[...scope.args];let where=scope.sql;
 for(const [key,column] of [['session','e.session_id'],['site','l.store_id'],['country','l.country']] as const){const v=p.get(key);if(v){where+=` AND ${column}=?`;args.push(v);}}
 const search=(p.get('search')||'').trim().slice(0,150);if(search){where+=" AND strpos(lower(l.name||' '||COALESCE(l.email,'')||' '||(e.snapshot->>'title')),lower(?))>0";args.push(search);}
 const rows=(await db().prepare(`SELECT ${liveColumns} ${liveJoins} WHERE ${where} ORDER BY s.starts_at DESC,l.name,e.id LIMIT 1001`).bind(...args).all()).results;
 const sessions=(await db().prepare(`SELECT s.*,t.title,t.trainer FROM live_sessions s JOIN live_trainings t ON t.id=s.training_id ${manage?'':`WHERE EXISTS(SELECT 1 FROM live_enrolments e JOIN learners l ON l.id=e.learner_id WHERE e.session_id=s.id AND ${scope.sql})`} ORDER BY s.starts_at DESC`).bind(...(manage?[]:scope.args)).all()).results;
 const trainings=manage?(await db().prepare('SELECT * FROM live_trainings ORDER BY title').all()).results:[];
 const learners=manage&&p.has('learnerSearch')?(await db().prepare(`SELECT l.id,l.name,l.email FROM learners l WHERE ${activeLearnerSql()} AND strpos(lower(l.name||' '||COALESCE(l.email,'')),lower(?))>0 ORDER BY l.name LIMIT 100`).bind((p.get('learnerSearch')||'').slice(0,150)).all()).results:[];
 const [sites,departments,roles]=manage?await Promise.all([db().prepare('SELECT id,name,country FROM organisation_stores WHERE active ORDER BY name').all(),db().prepare('SELECT id,name FROM organisation_departments WHERE NOT archived ORDER BY name').all(),db().prepare('SELECT id,name FROM job_roles WHERE NOT archived ORDER BY name').all()]):[{results:[]},{results:[]},{results:[]}];
 return json({manage,enabled:await featureEnabled('live_training'),rows:rows.slice(0,1000),truncated:rows.length>1000,sessions,trainings,learners,sites:sites.results,departments:departments.results,roles:roles.results});
 }catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{const actor=await liveAdmin(request),b=await bodyJson(request,100000);if(!b||typeof b!=='object')throw new CourseError('Check the training details.');return json(await mutateLive(actor,b));}catch(e){return failed(e);}}
