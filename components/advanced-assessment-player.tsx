'use client';
import {useState} from 'react';
import {Button} from './ui/button';
import {useLanguage} from './language-provider';
type Review={prompt:string;options:string[];correctIndices:number[];explanation:string};
type Result={correct:number;total:number;passed:boolean;review:Review[];submittedAt?:string};
type Allowance={used:number;remaining:number|null;retryAt:string|null};
export type AssessmentInfo={advanced:boolean;assignmentId:string;title:string;passed:boolean;lessonsComplete:boolean;passPercent:number;assessorRequired:boolean;allowance:Allowance;history:Result[]};
type Session={attemptId:string;questions:{prompt:string;options:string[];type:string}[];answers:(number[]|null)[];assessmentVersion:number;allowance:Allowance};
export default function AdvancedAssessmentPlayer({courseId,initial}:{courseId:string;initial:AssessmentInfo}){
 const {t}=useLanguage(),[info,setInfo]=useState(initial),[session,setSession]=useState<Session|null>(null),[answers,setAnswers]=useState<(number[]|null)[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[result,setResult]=useState<Result|null>(null);
 async function action(kind:'start'|'save'|'submit'){
  setBusy(true);setError('');try{
   const r=await fetch('/api/courses/quiz',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId,assignmentId:info.assignmentId,action:kind,attemptId:session?.attemptId,answers})}),d=await r.json();if(!r.ok)throw Error(d.error);
   if(kind==='start'){setSession(d);setAnswers(d.answers.length?d.answers:d.questions.map(()=>null));setResult(null);setSaved(true);}
   else if(kind==='save')setSaved(true);
   else{setResult(d);setSession(null);const response=await fetch('/api/courses/quiz?'+new URLSearchParams({courseId}),{cache:'no-store'});if(response.ok)setInfo(await response.json());}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const review=(r:Result)=><div>{r.review?.map((q,i)=><div className="quiz-question" key={i}><p>{q.prompt}</p><p>{t('Correct answer')}: {q.correctIndices.map(n=>q.options[n]).join(', ')}</p>{q.explanation&&<p>{q.explanation}</p>}</div>)}</div>;
 return <>{error&&<p role="alert" className="error">{t(error)}</p>}
 <p>{t('Pass mark')} {info.passPercent}% · {t('Remaining attempts')}: {info.allowance.remaining===null?t('Unlimited attempts'):info.allowance.remaining}</p>
 {info.passed?<div role="status"><h2>{t('You passed. Well done.')}</h2>{info.assessorRequired&&<p>{t('Theory complete — practical assessor sign-off is required before certification.')}</p>}<a href="/?courses=1">{t('My Courses')}</a></div>:!info.lessonsComplete?<><p>{t('Complete the lessons before taking the quiz.')}</p><a href={`/learn/${courseId}/`}>{t('Continue course')}</a></>:session?<form onSubmit={e=>{e.preventDefault();void action('submit');}}>
 <fieldset disabled={busy}>{session.questions.map((q,i)=><fieldset className="quiz-question" key={i}><legend>{i+1}. {q.prompt}</legend>{q.type==='multiple'&&<p>{t('Select all correct answers. No partial credit.')}</p>}{q.options.map((option,j)=><label className="quiz-answer" key={j}><input type={q.type==='multiple'?'checkbox':'radio'} name={'question-'+i} checked={answers[i]?.includes(j)||false} onChange={e=>{setSaved(false);setAnswers(answers.map((a,k)=>k!==i?a:q.type==='multiple'?(e.target.checked?[...(a||[]),j]:(a||[]).filter(n=>n!==j)):[j]));}}/>{q.type==='boolean'?t(option):option}</label>)}</fieldset>)}</fieldset>
 <div className="editor-actions"><Button type="button" variant="outline" disabled={busy} onClick={()=>void action('save')}>{t('Save progress')}</Button><Button disabled={busy||answers.some(a=>!a?.length)}>{t('Submit answers')}</Button></div><p role="status">{t(saved?'Saved':'Not saved')}</p>
 </form>:<><Button disabled={busy} onClick={()=>void action('start')}>{t('Start / resume assessment')}</Button>{info.allowance.retryAt&&Date.parse(info.allowance.retryAt)>Date.now()&&<p>{t('Retry available')}: {new Date(info.allowance.retryAt).toLocaleString()}</p>}</>}
 {result&&<div role="status"><h2>{t(result.passed?'You passed. Well done.':'You can try again.')}</h2><p>{result.correct}/{result.total} · {Math.round(result.correct/result.total*100)}%</p>{review(result)}</div>}
 {!!info.history.length&&<details><summary>{t('Attempt history')}</summary>{info.history.map((r,i)=><details key={i}><summary>{r.submittedAt&&new Date(r.submittedAt).toLocaleString()} · {r.correct}/{r.total} · {t(r.passed?'passed':'failed')}</summary>{review(r)}</details>)}</details>}
 </>;
}
