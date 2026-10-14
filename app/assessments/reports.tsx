'use client';
import CourseManagementTabs from '@/components/course-management-tabs';
import PageHeader from '@/components/page-header';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLanguage} from '@/components/language-provider';
export default function Reports({canManage=false,canFeedback=false}:{canManage?:boolean;canFeedback?:boolean}){
 const {t}=useLanguage(),[rows,setRows]=useState<Record<string,any>[]>([]),[canGrant,setCanGrant]=useState(false),[query,setQuery]=useState(''),[scope,setScope]=useState(''),[error,setError]=useState(''),[grant,setGrant]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/assessments?'+new URLSearchParams({...Object.fromEntries(new URLSearchParams(window.location.search)),q:query}),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.rows);setCanGrant(d.canGrant);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{setScope(window.location.search);void load();},[]);
 async function save(){setBusy(true);setError('');try{const r=await fetch('/api/assessments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignmentId:grant,reason,requestId:crypto.randomUUID()})}),d=await r.json();if(!r.ok)throw Error(d.error);setGrant('');setReason('');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="shell course-admin app-page"><PageHeader title={t('Assessment reports')} view="report"/><main className="main assessment-page"><CourseManagementTabs active="assessments" canManage={canManage} canFeedback={canFeedback}/>
 <form className="assessment-toolbar assessment-report-toolbar" onSubmit={e=>{e.preventDefault();void load();}}><Input aria-label={t('Search')} placeholder={t('Search')} value={query} onChange={e=>setQuery(e.target.value)}/><Button>{t('Search')}</Button><Button asChild variant="outline"><a href={'/api/assessments?'+new URLSearchParams({...Object.fromEntries(new URLSearchParams(scope)),format:'csv',q:query})}>{t('Export CSV')}</a></Button></form>
 {error&&<p role="alert" className="error">{t(error)}</p>}{grant&&<form className="paper" onSubmit={e=>{e.preventDefault();void save();}}><label>{t('Reason')}<Input required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy}>{t('Grant another attempt')}</Button><Button type="button" variant="outline" onClick={()=>setGrant('')}>{t('Cancel')}</Button></form>}
 <div className="assessment-list">{rows.map((r,i)=><article className="paper" key={i}><strong>{r.name} · {r.course_title}</strong><p>{r.email} · {r.store_id} · {t('Version')} {r.learning_version}</p><p>{r.attempt_id?<>{new Date(r.submitted_at).toLocaleString()} · {r.correct_count}/{r.question_count} · {Math.round(r.correct_count/r.question_count*100)}% · {t(r.passed?'passed':'failed')}</>:t(r.in_progress?'In progress':'Not started')}</p><p>{t('Remaining attempts')}: {r.remaining??t('Unlimited attempts')}</p>{canGrant&&Number(r.remaining)===0&&r.remaining!==null&&!r.passed&&<Button variant="outline" onClick={()=>setGrant(r.assignment_id)}>{t('Grant another attempt')}</Button>}</article>)}</div>
 </main></div>;
}
