import {validFeedbackEligibility} from './feedback';
import {db,inTransaction} from './database';
import {CourseError} from './course-admin';
import type {FeedbackQuestion,FeedbackAnswer} from './feedback-types';
export function feedbackStats(questions:FeedbackQuestion[],rows:{answers:FeedbackAnswer[]}[],anonymous:boolean){
 return questions.map((q,i)=>{
  const answers=rows.map(r=>r.answers[i]).filter(a=>a!==null&&a!==undefined),answered=answers.length;
  if(anonymous&&answered<5)return {question:q,suppressed:true,answered:null};
  if(q.type==='text')return {question:q,answered,comments:(answers as string[]).sort()};
  const counts=q.options.map((label,j)=>({label,value:q.type==='rating'?j+1:j,count:answers.filter(a=>Array.isArray(a)?a.includes(j):a===(q.type==='rating'?j+1:j)).length}));
  return {question:q,answered,counts,average:q.type==='rating'&&answered?(answers as number[]).reduce((a,b)=>a+b,0)/answered:null};
 });
}
export async function feedbackReport(p:URLSearchParams){
 // Whitelist filters: never accept a learner/site/session filter or arbitrary day
 // boundary that can split a protected anonymous cohort or reveal its complement.
 for(const key of p.keys())if(!['target','from','to','format'].includes(key))throw new CourseError('Use course and completion-month filters.');
 const from=p.get('from')||'',to=p.get('to')||'',target=p.get('target')||'';
 if([from,to].some(v=>v&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))||from&&to&&from>to)throw new CourseError('Choose a valid completion-month range.');
 return inTransaction(async tx=>{
 await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
 const args=[target,target,from,from,to,to];
 const filter=`(?='' OR e.kind||':'||e.target_id=?) AND (?='' OR e.completion_month>=?) AND (?='' OR e.completion_month<=?)`;
 const groups=(await db().prepare(`SELECT e.kind,e.target_id,min(e.title) AS title,e.survey_id,e.version,e.completion_month,s.mode,v.name,v.questions,count(*)::int AS eligible
  FROM feedback_eligibility e JOIN feedback_surveys s ON s.id=e.survey_id JOIN feedback_versions v ON v.survey_id=e.survey_id AND v.version=e.version
  WHERE ${filter} AND (e.submitted OR ${validFeedbackEligibility}) GROUP BY e.kind,e.target_id,e.survey_id,e.version,e.completion_month,s.mode,v.name,v.questions
  ORDER BY e.completion_month DESC,title,e.version`).bind(...args).all<any>()).results;
 const result=[];
 for(const g of groups){
  const rows=(await db().prepare(`SELECT r.answers,CASE WHEN r.mode='named' THEN l.name END AS respondent
   FROM feedback_responses r LEFT JOIN learners l ON l.id=r.respondent_id AND r.mode='named'
   WHERE r.kind=? AND r.target_id=? AND r.survey_id=? AND r.version=? AND r.completion_month=?`).bind(g.kind,g.target_id,g.survey_id,g.version,g.completion_month).all<{answers:FeedbackAnswer[];respondent:string|null}>()).results;
  const suppressed=g.mode==='anonymous'&&rows.length<5;
  const {questions,...safe}=g;
  result.push({...safe,suppressed,responses:suppressed?null:rows.length,responseRate:suppressed?null:(g.eligible?100*rows.length/g.eligible:0),
   questions:suppressed?[]:feedbackStats(questions,rows,g.mode==='anonymous'),
   ...(g.mode==='named'?{namedResponses:rows.map(r=>({name:r.respondent,answers:r.answers}))}:{})});
 }
 return {groups:result};
 });
}
export function feedbackCsv(report:Awaited<ReturnType<typeof feedbackReport>>){
 const rows:unknown[][]=[['Course / training','Completion month','Survey','Version','Mode','Eligible','Responses','Response rate (%)','Question','Answered','Average','Choice / comment','Count','Respondent']];
 for(const g of report.groups){const base=[g.title,g.completion_month,g.name,g.version,g.mode,g.eligible,g.responses,g.responseRate];
  if(g.suppressed){rows.push([...base,'Suppressed: fewer than five responses']);continue;}
  rows.push(base);
  for(const q of g.questions){const b=[...base,q.question.prompt,q.answered,q.average??''];
   if(q.suppressed)rows.push([...b,'Suppressed: fewer than five answers']);
   for(const c of q.counts||[])rows.push([...b,c.label,c.count]);
   for(const comment of q.comments||[])rows.push([...b,comment]);
  }
  for(const r of g.namedResponses||[])for(let i=0;i<g.questions.length;i++){
   const q=g.questions[i].question,a=r.answers[i];
   const label=a===null?'':q.type==='text'?a:q.type==='rating'?`${a} — ${q.options[Number(a)-1]}`:Array.isArray(a)?a.map(j=>q.options[j]).join('; '):q.options[Number(a)];
   rows.push([...base,q.prompt,'','',label,'',r.name]);
  }
 }
 const cell=(v:unknown)=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
