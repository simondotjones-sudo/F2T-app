'use client';
import {useEffect,useState,useRef} from 'react';
import {useFeatures} from '@/hooks/use-features';
import {useLanguage} from './language-provider';
import type {FeedbackInvitation} from '@/lib/feedback-types';
import FeedbackForm from './feedback-form';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import '@/app/feedback/feedback.css';
export default function FeedbackInvitations(){
 const prompted=useRef(false);
 const features=useFeatures(),{t}=useLanguage(),[items,setItems]=useState<FeedbackInvitation[]>([]),[selected,setSelected]=useState<FeedbackInvitation|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{if(!features.course_feedback){setItems([]);return;}let active=true;const load=async()=>{try{const r=await fetch('/api/feedback',{cache:'no-store'});if(r.ok&&active)setItems((await r.json()).invitations);}catch{}};void load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};},[features.course_feedback]);
 useEffect(()=>{
  if(prompted.current||!items.length)return;
  prompted.current=true;
  try{const next=items.find(i=>!sessionStorage.getItem('feedback-seen:'+i.id));if(next){sessionStorage.setItem('feedback-seen:'+next.id,'1');setSelected(next);}}catch{/* The invitation list remains available when session storage is disabled. */}
 },[items]);
 if(!features.course_feedback)return null;
 return <>{notice&&<p role="status">{t(notice)}</p>}{!!items.length&&<section className="feedback-invitations paper" aria-label={t('Course feedback')}><h2>{t('Course feedback')}</h2><p>{t('Feedback is optional. It does not affect completion, compliance or certificates.')}</p>{items.map(item=><div className="feedback-invite" key={item.id}><span>{item.title} · {item.completion_month}</span><button onClick={()=>setSelected(item)}>{t('Give feedback')}</button></div>)}</section>}
 <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="feedback-dialog"><DialogHeader><DialogTitle>{t('Course feedback')}</DialogTitle><DialogDescription>{t('You can return here from My Courses to complete it later.')}</DialogDescription></DialogHeader>{selected&&<FeedbackForm key={selected.id} invitation={selected} onLater={()=>setSelected(null)} onDone={()=>{setItems(items.filter(i=>i.id!==selected.id));setSelected(null);setNotice('Thank you for your feedback.');}}/>}</DialogContent></Dialog></>;
}
