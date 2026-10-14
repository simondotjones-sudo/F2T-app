'use client';
import {useEffect,useState} from 'react';
import {useLanguage} from './language-provider';
export default function ExternalTrainingSummary(){
 const {t,date}=useLanguage(),[data,setData]=useState<{enabled:boolean;rows:{id:string;title:string;display_status:string;expires_on:string|null}[]}|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();fetch('/api/external-training',{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
 if(error)return <p role="alert">{t(error)}</p>;if(!data||!data.enabled&&!data.rows.length)return null;
 const labels:Record<string,string>={pending:'Pending',approved:'Approved',rejected:'Rejected',revoked:'Revoked',expired:'Expired'};
 return <section className="paper" style={{padding:24,marginTop:24}}><h2>{t('External training')}</h2><p>{t('Original external certificate evidence')}</p>{data.rows.map(r=><p key={r.id}><strong>{r.title}</strong> · {t(labels[r.display_status])} · {r.expires_on?date(r.expires_on):t('No expiry')}{r.display_status==='approved'&&r.expires_on&&Date.parse(r.expires_on)<=Date.now()+30*86400000?' · '+t('Expiring soon'):''}</p>)}<a href="/external-training">{t('My external training')} →</a></section>;
}
