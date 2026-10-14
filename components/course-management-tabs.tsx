'use client';
import {useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useFeatures} from '@/hooks/use-features';
import {useLanguage} from '@/components/language-provider';
import './course-management-tabs.css';
type Section='courses'|'banks'|'assessments'|'feedback';
export default function CourseManagementTabs({active,canManage=true,canFeedback=true}:{active:Section;canManage?:boolean;canFeedback?:boolean}){
 const {t}=useLanguage(),features=useFeatures(),router=useRouter(),selected=useRef<HTMLButtonElement>(null);
 const tabs=[
  ...(canManage?[{id:'courses',label:'Courses',href:'/admin/courses/'}]:[]),
  ...(canManage&&(features.advanced_assessments||active==='banks')?[{id:'banks',label:'Question banks',href:'/admin/question-banks/'}]:[]),
  {id:'assessments',label:'Assessment reports',href:'/assessments/'},
  ...(canFeedback&&(features.course_feedback||active==='feedback')?[{id:'feedback',label:'Course feedback',href:'/admin/feedback/'}]:[]),
 ];
 useEffect(()=>{const button=selected.current,strip=button?.parentElement?.parentElement;if(button&&strip)strip.scrollLeft=Math.max(0,button.offsetLeft-strip.offsetLeft-(strip.clientWidth-button.clientWidth)/2);},[active,canManage,canFeedback,features.advanced_assessments,features.course_feedback]);
 return <nav className="course-management-tabs" aria-label={t('Manage Courses')}><div className="pill-switch" role="group">{tabs.map(tab=><button key={tab.id} type="button" ref={tab.id===active?selected:undefined} aria-pressed={tab.id===active} onClick={()=>{if(tab.id!==active)router.push(tab.href);}}>{t(tab.label)}</button>)}</div></nav>;
}
