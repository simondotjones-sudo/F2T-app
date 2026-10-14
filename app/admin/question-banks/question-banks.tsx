'use client';
import CourseManagementTabs from '@/components/course-management-tabs';
import PageHeader from '@/components/page-header';
import {useEffect,useState} from 'react';
import AssessmentQuestionEditor,{emptyQuestion} from '@/components/assessment-question-editor';
import type {QuizQuestion} from '@/lib/course-quiz';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLanguage} from '@/components/language-provider';
import {useFeatures} from '@/hooks/use-features';
type Bank={id?:string;name:string;shared:boolean;revision?:number;questions:QuizQuestion[];readOnly?:boolean};
export default function Banks(){
 const {t}=useLanguage(),features=useFeatures(),[banks,setBanks]=useState<Bank[]>([]),[bank,setBank]=useState<Bank|null>(null),[platform,setPlatform]=useState(false),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/admin/question-banks',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setBanks(d.banks);setPlatform(d.platformAdmin);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function save(){setBusy(true);setError('');try{const r=await fetch('/api/admin/question-banks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bank)}),d=await r.json();if(!r.ok)throw Error(d.error);setBank(null);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="shell course-admin app-page"><PageHeader title={t('Question banks')} view="courses"/><main className="main assessment-page"><CourseManagementTabs active="banks"/>{error&&<p className="error" role="alert">{t(error)}</p>}
 <div className="assessment-toolbar"><Button className="blue-button" disabled={!features.advanced_assessments} onClick={()=>setBank({name:'',shared:false,questions:[emptyQuestion()]})}>{t('Add question bank')}</Button><Input aria-label={t('Search')} placeholder={t('Search')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
 {bank?<form className="paper" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||bank.readOnly||!features.advanced_assessments}><label>{t('Name')}<Input required maxLength={120} value={bank.name} onChange={e=>setBank({...bank,name:e.target.value})}/></label>{platform&&<label><input type="checkbox" checked={bank.shared} onChange={e=>setBank({...bank,shared:e.target.checked})}/>{t('Shared')}</label>}<AssessmentQuestionEditor questions={bank.questions} onChange={questions=>setBank({...bank,questions})}/><Button type="submit">{t('Save')}</Button></fieldset><Button type="button" variant="outline" onClick={()=>setBank(null)}>{t('Close')}</Button></form>:
 <div className="assessment-list">{banks.filter(b=>b.name.toLowerCase().includes(query.toLowerCase())).map(b=><Button key={b.id} variant="outline" onClick={()=>setBank(structuredClone(b))}>{b.name} · {b.questions.length} {b.readOnly&&t('Read only')}</Button>)}</div>}
 </main></div>;
}
