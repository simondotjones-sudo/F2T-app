'use client';
import {useEffect,useState} from 'react';
import PageHeader from '@/components/page-header';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLanguage} from '@/components/language-provider';
type Key={id:string;name:string;expires_at:string;revoked_at:string|null;last_used_at:string|null};
type Event={id:string;employee_id:string;effective_on:string;status:string;result:{error?:string;action?:string;pathwayFailures?:number}};
type Data={lastSuccess:string|null;keys:Key[];events:Event[];managed:{id:string;name:string;workday_id:string}[];counts:{status:string;count:number}[];slug:string;enabled:boolean;lifecycle:boolean};
export default function Integrations(){
 const {t}=useLanguage();const [data,setData]=useState<Data|null>(null),[tab,setTab]=useState('Credentials'),[name,setName]=useState(''),[filter,setFilter]=useState(''),[secret,setSecret]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(search=filter){try{const r=await fetch('/api/admin/integrations?employeeId='+encodeURIComponent(search),{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load('');},[]);
 async function act(action:string,id?:string){
 if(['revoke','rotate','release','cancel'].includes(action)&&!window.confirm(t('Confirm this integration change?')))return;
 setBusy(true);setError('');setSecret('');try{const r=await fetch('/api/admin/integrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,name})}),d=await r.json();if(!r.ok)throw new Error(d.error);if(d.token)setSecret(d.token);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="shell course-admin"><PageHeader title={t('Integrations')} view="integrations"/><main className="main hr-main">
 {error&&<p role="alert" className="hr-error">{t(error)}</p>}
 {!data?<p>{t('Loading…')}</p>:<>
 <p>{t('Last successful sync')}: {data.lastSuccess?new Date(data.lastSuccess).toLocaleString():'—'}</p>
 <div className="hr-summary">{['applied','scheduled','failed'].map(status=><div key={status}><strong>{data.counts.find(c=>c.status===status)?.count||0}</strong><span>{t(status)}</span></div>)}</div>
 {(!data.enabled||!data.lifecycle)&&<p className="hr-info">{t('Enable HR integration and lifecycle handling in Settings first.')} <a href="/admin/settings">{t('Settings')}</a></p>}
 <nav className="hr-tabs pill-switch" aria-label={t('Integrations')}>{['Credentials','Sync history','Managed employees','API guide'].map(label=><button key={label} onClick={()=>setTab(label)} aria-pressed={tab===label}>{t(label)}</button>)}</nav>
 {secret&&<section className="hr-card" role="status"><h2>{t('Copy this credential now')}</h2><p>{t('It will not be shown again. Rotation invalidates the previous credential immediately.')}</p><code className="hr-secret">{secret}</code><Button onClick={()=>setSecret('')}>{t('Done')}</Button></section>}
 {tab==='Credentials'&&<><form className="hr-toolbar" onSubmit={e=>{e.preventDefault();void act('create');}}><Input aria-label={t('Credential name')} placeholder={t('Credential name')} value={name} maxLength={80} onChange={e=>setName(e.target.value)} required/><Button disabled={busy||!data.enabled||!data.lifecycle||name.trim().length<2}>{t('Create credential')}</Button></form>{data.keys.map(k=><section className="hr-card" key={k.id}><div><h2>{k.name}</h2><p>{t('Expires')}: {k.expires_at.slice(0,10)} · {t('Last used')}: {k.last_used_at?.slice(0,16)||'—'}</p>{k.revoked_at&&<p>{t('Revoked')}</p>}</div><div className="hr-actions"><Button variant="outline" disabled={busy||!!k.revoked_at} onClick={()=>void act('rotate',k.id)}>{t('Rotate')}</Button><Button variant="outline" disabled={busy||!!k.revoked_at} onClick={()=>void act('revoke',k.id)}>{t('Revoke')}</Button></div></section>)}</>}
 {['Sync history','Managed employees'].includes(tab)&&<form className="hr-toolbar" onSubmit={e=>{e.preventDefault();void load();}}><Input value={filter} onChange={e=>setFilter(e.target.value)} aria-label={t('Employee ID')} placeholder={t('Employee ID')}/><Button disabled={busy}>{t('Search')}</Button><Button type="button" variant="outline" onClick={()=>void load()}>{t('Refresh')}</Button></form>}
 {tab==='Sync history'&&<><p>{t('Latest 100 events. Search by employee ID to narrow results.')}</p>{data.events.map(e=><section className="hr-card" key={e.id}><div><h2>{e.employee_id} · {t(e.status)}</h2><p>{e.result.action} · {e.effective_on.slice(0,10)}</p><small>{e.id}</small>{e.result.error&&<p className="hr-error">{t(e.result.error)}</p>}{!!e.result.pathwayFailures&&<p>{t('Review automatic pathway assignment failures.')}</p>}</div><div className="hr-actions">{e.status==='failed'&&<Button disabled={busy} onClick={()=>void act('retry',e.id)}>{t('Retry')}</Button>}{['failed','scheduled'].includes(e.status)&&<Button variant="outline" disabled={busy} onClick={()=>void act('cancel',e.id)}>{t('Cancel')}</Button>}</div></section>)}</>}
 {tab==='Managed employees'&&<><p>{t('Payroll controls identity, site, department, job role and employment dates. Cancel pending changes before releasing control.')}</p>{data.managed.map(p=><section className="hr-card" key={p.id}><div><h2>{p.name}</h2><p>{p.workday_id}</p></div><Button variant="outline" disabled={busy} onClick={()=>void act('release',p.id)}>{t('Release payroll control')}</Button></section>)}</>}
 {tab==='API guide'&&<section className="hr-card hr-guide"><h2>{t('HR & payroll integration')}</h2><p>{t('Download the integration guide for your payroll provider.')}</p><a href="/hr-api-guide.md" download>{t('Download API guide')}</a><code>{`/api/hr/v1/employees?client=${data.slug}`}</code><code>{`/api/hr/v1/reference?client=${data.slug}`}</code><p>{t('New accounts use password recovery or SSO. The API never accepts passwords or administrator permissions.')}</p><p>{t('Scheduled changes apply from midnight UTC, checked every five minutes when background jobs are enabled.')}</p></section>}
 </>}
 </main></div>;
}
