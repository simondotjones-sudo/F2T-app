'use client';
import {useEffect,useState} from 'react';
import {useLanguage} from './language-provider';
import {languageLocale} from '@/lib/i18n';
import {liveStatus,type LiveRecord} from '@/lib/live-training-types';
import type {CourseView} from './assigned-courses';
import '@/app/live-training/live-training.css';
export default function AssignedLiveTraining({view,onCount}:{view:CourseView;onCount:(n:number)=>void}){
 const {t,lang,date}=useLanguage();const [rows,setRows]=useState<LiveRecord[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;const load=()=>fetch('/api/live-training?view=mine',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(active){setRows(d.rows);setError('');}}).catch(e=>{if(active)setError(e.message);});void load();const timer=setInterval(()=>void load(),60000);return()=>{active=false;clearInterval(timer);};},[]);
 const visible=rows.filter(r=>view==='all'||view==='certs'&&r.certificate_token||view==='completed'&&r.attendance==='attended'||view==='todo'&&r.attendance!=='attended'&&r.attendance!=='cancelled'&&r.session_status!=='cancelled');
 useEffect(()=>{onCount(visible.length);},[visible.length,onCount]);
 if(view==='induction')return null;
 if(error)return <p role="alert">{t(error)}</p>;
 if(!visible.length)return null;
 return <section><h2>{t('Live Training')}</h2><div className="live-learner-grid">{visible.map(r=><article className="live-card" key={r.id}><h3>{r.title}</h3><strong>{t(liveStatus(r))}</strong>{r.description&&<p>{r.description}</p>}<p>{new Intl.DateTimeFormat(languageLocale(lang),{dateStyle:'full',timeStyle:'short',timeZone:r.time_zone}).format(new Date(r.starts_at))}<br/>{r.time_zone}</p><p>{t('End')}: {new Intl.DateTimeFormat(languageLocale(lang),{dateStyle:'medium',timeStyle:'short',timeZone:r.time_zone}).format(new Date(r.ends_at))}</p><p>{r.trainer} · {t(r.format==='webinar'?'Webinar':'Classroom')}</p>{r.location&&<p>{r.location}</p>}<div className="live-actions">
 {r.can_join&&r.format==='webinar'&&<a className="blue-button" target="_blank" rel="noopener noreferrer" href={'/api/live-training/join?id='+encodeURIComponent(r.id)}>{t('Join webinar')}</a>}
 {r.attendance==='assigned'&&r.session_status==='scheduled'&&Date.parse(r.ends_at)>Date.now()&&<a href={'/api/live-training/calendar?id='+encodeURIComponent(r.id)}>{t('Add to calendar')}</a>}
 {r.certificate_token&&<a href={'/live-training/certificates/'+r.certificate_token}>{t('View certificate')}</a>}</div>{r.expires_at&&<p>{t('Expires {date}',{date:date(r.expires_at)})}</p>}</article>)}</div></section>;
}
