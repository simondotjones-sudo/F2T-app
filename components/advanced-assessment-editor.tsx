'use client';
import {useEffect,useState} from 'react';
import type {CourseQuiz,QuizQuestion,AssessmentOptions} from '@/lib/course-quiz';
import AssessmentQuestionEditor from './assessment-question-editor';
import {Input} from './ui/input';
import {NativeSelect} from './ui/native-select';
import {Button} from './ui/button';
import {useLanguage} from './language-provider';
export const assessmentDefaults:AssessmentOptions={mode:'fixed',count:10,bankIds:[],categories:[],shuffleQuestions:false,shuffleAnswers:false,maxAttempts:null,retryMinutes:0,review:'never'};
export default function AdvancedAssessmentEditor({value,onChange}:{value:CourseQuiz;onChange:(v:CourseQuiz)=>void}){
 const {t}=useLanguage(),[banks,setBanks]=useState<{id:string;name:string;questions:QuizQuestion[]}[]>([]),[error,setError]=useState('');
 const a=value.advanced!,change=(patch:Partial<AssessmentOptions>)=>onChange({...value,advanced:{...a,...patch}});
 useEffect(()=>{fetch('/api/admin/question-banks',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setBanks(d.banks);}).catch(e=>setError(e.message));},[]);
 const selected=banks.filter(b=>a.bankIds.includes(b.id)),categories=[...new Set(selected.flatMap(b=>b.questions.map(q=>q.category||'')).filter(Boolean))];
 const eligible=selected.flatMap(b=>b.questions.filter(q=>!a.categories.length||a.categories.includes(q.category||'')));
 return <div className="assessment-controls">{error&&<p role="alert">{t(error)}</p>}
 <a href="/admin/question-banks/" target="_blank" rel="noreferrer">{t('Question banks')}</a>
 <label>{t('Assessment selection')}<NativeSelect value={a.mode} onChange={e=>change({mode:e.target.value as AssessmentOptions['mode']})}><option value="fixed">{t('Fixed questions')}</option><option value="random">{t('Random from banks')}</option></NativeSelect></label>
 <fieldset><legend>{t('Question banks')}</legend>{banks.map(b=><label key={b.id}><input type="checkbox" checked={a.bankIds.includes(b.id)} onChange={e=>change({bankIds:e.target.checked?[...a.bankIds,b.id]:a.bankIds.filter(id=>id!==b.id)})}/>{b.name}</label>)}</fieldset>
 {!!categories.length&&<fieldset><legend>{t('Categories')}</legend>{categories.map(c=><label key={c}><input type="checkbox" checked={a.categories.includes(c)} onChange={e=>change({categories:e.target.checked?[...a.categories,c]:a.categories.filter(v=>v!==c)})}/>{c}</label>)}</fieldset>}
 {a.mode==='random'?<><Button type="button" variant="outline" onClick={()=>onChange({...value,questions:[]})}>{t('Refresh')}</Button><label>{t('Question count')}<Input required type="number" min={1} max={50} value={a.count} onChange={e=>change({count:e.target.valueAsNumber})}/></label><p role={eligible.length<a.count?'alert':undefined}>{t('Eligible questions')}: {eligible.length}</p></>:<>
 {selected.map(b=><details key={b.id}><summary>{b.name}</summary>{b.questions.filter(q=>!a.categories.length||a.categories.includes(q.category||'')).map(q=><Button key={q.id} type="button" variant="outline" disabled={value.questions.length>=50} onClick={()=>onChange({...value,questions:[...value.questions,{...q,id:crypto.randomUUID(),bankId:b.id}]})}>{t('Add question')}: {q.prompt}</Button>)}</details>)}
 <AssessmentQuestionEditor questions={value.questions} onChange={questions=>onChange({...value,questions})}/></>}
 <label><input type="checkbox" checked={a.shuffleQuestions} onChange={e=>change({shuffleQuestions:e.target.checked})}/>{t('Randomise question order')}</label>
 <label><input type="checkbox" checked={a.shuffleAnswers} onChange={e=>change({shuffleAnswers:e.target.checked})}/>{t('Randomise answer order')}</label>
 <label><input type="checkbox" checked={a.maxAttempts===null} onChange={e=>change({maxAttempts:e.target.checked?null:3})}/>{t('Unlimited attempts')}</label>
 {a.maxAttempts!==null&&<label>{t('Maximum attempts')}<Input required type="number" min={1} max={100} value={a.maxAttempts} onChange={e=>change({maxAttempts:e.target.valueAsNumber})}/></label>}
 <label>{t('Retry delay (minutes)')}<Input required type="number" min={0} max={525600} value={a.retryMinutes} onChange={e=>change({retryMinutes:e.target.valueAsNumber})}/></label>
 <label>{t('Show correct answers')}<NativeSelect value={a.review} onChange={e=>change({review:e.target.value as AssessmentOptions['review']})}><option value="each">{t('After each attempt')}</option><option value="pass">{t('Only after passing')}</option><option value="never">{t('Never')}</option></NativeSelect></label>
 </div>;
}
