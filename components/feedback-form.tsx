'use client';
import {useState} from 'react';
import {useLanguage} from './language-provider';
import {Button} from './ui/button';
import type {FeedbackInvitation,FeedbackAnswer} from '@/lib/feedback-types';
export default function FeedbackForm({invitation,onDone,onLater}:{invitation:FeedbackInvitation;onDone:()=>void;onLater:()=>void}){
 const {t}=useLanguage(),[answers,setAnswers]=useState<FeedbackAnswer[]>(invitation.questions.map(()=>null)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=(i:number,value:FeedbackAnswer)=>setAnswers(a=>a.map((v,j)=>j===i?value:v));
 async function submit(){setBusy(true);setError('');try{const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:invitation.id,version:invitation.version,mode:invitation.mode,answers})}),d=await r.json();if(!r.ok)throw Error(d.error);onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <form className="feedback-form" onSubmit={e=>{e.preventDefault();void submit();}}>
 <h2>{invitation.title}</h2><p>{invitation.name} · {invitation.completion_month}</p>
 <p>{t('Feedback is optional. It does not affect completion, compliance or certificates.')}</p>
 <p className="feedback-note">{t(invitation.mode==='anonymous'?'Anonymous: your answers are stored separately from your identity. Results appear only in groups of five or more. Do not identify yourself or others in comments.':'Named: your name and answers will be visible to authorised administrators.')}</p>
 {error&&<p role="alert" className="error">{t(error)}</p>}
 <fieldset disabled={busy}>{invitation.questions.map((q,i)=><fieldset key={q.id} className="feedback-question"><legend>{q.prompt} · {t(q.required?'Required':'Optional')}</legend>
 {q.type==='text'?<textarea aria-label={q.prompt} maxLength={2000} required={q.required} value={typeof answers[i]==='string'?answers[i] as string:''} onChange={e=>change(i,e.target.value)}/>:
 q.options.map((option,j)=>{const value=q.type==='rating'?j+1:j,checked=q.type==='multiple'?Array.isArray(answers[i])&&(answers[i] as number[]).includes(j):answers[i]===value;return <label className="feedback-option" key={j}><input type={q.type==='multiple'?'checkbox':'radio'} name={q.id} required={q.required&&q.type!=='multiple'} checked={checked} onChange={e=>change(i,q.type==='multiple'?(e.target.checked?[...(Array.isArray(answers[i])?answers[i] as number[]:[]),j]:(answers[i] as number[]).filter(v=>v!==j)):value)}/><span>{q.type==='rating'&&`${value} · `}{option}</span></label>;})}
 {!q.required&&q.type!=='text'&&<button type="button" onClick={()=>change(i,null)}>{t('Clear')}</button>}
 </fieldset>)}</fieldset>
 <div className="feedback-actions"><Button disabled={busy} type="submit">{t('Submit feedback')}</Button><Button disabled={busy} type="button" variant="outline" onClick={onLater}>{t('Complete later')}</Button></div>
 </form>;
}
