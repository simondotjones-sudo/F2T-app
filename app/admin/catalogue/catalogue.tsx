'use client';
import {useEffect,useState} from 'react';
import {Search,BookOpen,ArrowUpRight} from 'lucide-react';
import PageHeader from '@/components/page-header';
import {useLanguage} from '@/components/language-provider';
import {portalUrl} from '@/lib/tenant-types';
import './catalogue.css';
type Client={id:number;name:string;slug:string};
type Master={id:string;title:string;status:string;revision:number;version:number;release_id:string|null;sourceClientId:number;sourceClientName:string;sourceSlug:string};
type Subscription={course_id:string;source_client_id:number;source_course_id:string;version:number;active:boolean;clientId:number};
type Overview={clients:Client[];courses:Master[];subscriptions:Subscription[]};
export default function Catalogue(){
 const {t}=useLanguage();const [data,setData]=useState<Overview|null>(null),[filter,setFilter]=useState<'all'|'specific'|'shared'>('all'),[search,setSearch]=useState(''),[clientFilter,setClientFilter]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const key=(c:Master)=>`${c.sourceClientId}:${c.id}`;
 async function refresh(){const r=await fetch('/api/admin/catalogue',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);}
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 async function act(body:object){setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/admin/catalogue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.error);await refresh();setNotice(t('Settings saved.'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const sharedClients=(c:Master)=>new Set(data?.subscriptions.filter(s=>s.active&&Number(s.source_client_id)===c.sourceClientId&&s.source_course_id===c.id&&s.clientId!==c.sourceClientId).map(s=>s.clientId)).size;
 const total=data?.courses.length||0,shared=data?.courses.filter(c=>sharedClients(c)>0).length||0;
 const visible=data?.courses.filter(c=>(filter==='all'||(filter==='shared'?sharedClients(c)>0:sharedClients(c)===0))&&(filter!=='specific'||!clientFilter||String(c.sourceClientId)===clientFilter)&&(c.title+' '+c.sourceClientName).toLowerCase().includes(search.trim().toLowerCase()))||[];
 const course=visible.find(c=>key(c)===selected);
 const tabs=[{id:'all',label:'All'},{id:'specific',label:'Client-specific'},{id:'shared',label:'Shared'}] as const;
 return <div className="shell"><PageHeader title={t('Course Sharing')} view="catalogue"/><main className="catalogue-main">
 <div className="catalogue-summary" aria-label={t('Course Sharing')}>
 {[{label:'Total courses',count:total},{label:'Client-specific',count:total-shared},{label:'Shared',count:shared}].map(item=><div key={item.label}><strong>{data?item.count:'—'}</strong><span>{t(item.label)}</span></div>)}
 </div>
 {error&&<p role="alert" className="error">{t(error)}</p>}{notice&&<p role="status">{notice}</p>}
 {!data&&!error&&<p>{t('Loading…')}</p>}
 <div className="catalogue-switcher pill-switch" role="group" aria-label={t('Course Sharing')}>{tabs.map(tab=><button key={tab.id} aria-pressed={filter===tab.id} onClick={()=>{setFilter(tab.id);setNotice('');}}>{t(tab.label)}</button>)}</div>
 {filter==='specific'&&<div className="catalogue-client-filter"><label htmlFor="catalogue-client-filter">{t('Clients')}</label><select id="catalogue-client-filter" value={clientFilter} disabled={!data} onChange={e=>{setClientFilter(e.target.value);setSelected('');setNotice('');}}><option value="">{t('All clients')}</option>{data?.clients.map(client=><option key={client.id} value={String(client.id)}>{client.name}</option>)}</select></div>}
 <div className="catalogue-layout"><section className="catalogue-panel"><label className="catalogue-search"><input aria-label={t('Search courses')} placeholder={t('Search courses')} value={search} onChange={e=>setSearch(e.target.value)}/><Search size={18}/></label>
 {visible.map(c=><button disabled={busy} className={`catalogue-course ${selected===key(c)?'selected':''}`} key={key(c)} onClick={()=>{setSelected(key(c));setNotice('');}}><BookOpen size={21}/><span><strong>{c.title}</strong><small>{c.sourceClientName} · {sharedClients(c)?t(sharedClients(c)===1?'Shared with {count} client':'Shared with {count} clients').replace('{count}',String(sharedClients(c))):t('Client-specific')}</small></span></button>)}
 {data&&data.courses.length>0&&!visible.length&&<p>{t('No matching courses')}</p>}
 {data&&!data.courses.length&&<p>{t('Create a master course in a client course library first.')}</p>}
 </section><section className="catalogue-panel">{course?<><div className="catalogue-heading"><div><h3>{course.title}</h3><p>{course.sourceClientName}</p></div><a href={portalUrl(course.sourceSlug,'/admin/courses')}>{t('Manage courses')} <ArrowUpRight size={16}/></a></div>
 <p>{t('Publish a catalogue version after saving changes to the master course.')}</p>
 <button disabled={busy||course.status!=='published'} className="blue-button" onClick={()=>void act({action:'publish',sourceClientId:course.sourceClientId,courseId:course.id,revision:course.revision})}>{t('Publish catalogue version')}</button>
 {course.status!=='published'&&<p>{t('Publish the master course first.')}</p>}
 <h3 className="catalogue-clients-title">{t('Client availability')}</h3>
 <p className="catalogue-note">{t('Availability does not assign training. Existing learners keep their original course version.')}</p>
 {data?.clients.filter(c=>c.id!==course.sourceClientId).map(client=>{const link=data.subscriptions.find(s=>s.clientId===client.id&&Number(s.source_client_id)===course.sourceClientId&&s.source_course_id===course.id);return <div className="catalogue-client" key={client.id}><div><strong>{client.name}</strong><small>{link?`${t(link.active?'Available':'Withdrawn')} · ${t('Version')} ${link.version}`:t('Not available')}</small></div><div className="catalogue-actions">
 {(!link?.active||link.version<course.version)&&<button className="blue-button" disabled={busy||!course.release_id} onClick={()=>void act({action:'distribute',sourceClientId:course.sourceClientId,clientId:client.id,releaseId:course.release_id,version:link?.version||0})}>{t(link?.active?'Update version':'Make available')}</button>}
 {link?.active&&<button disabled={busy} onClick={()=>void act({action:'withdraw',clientId:client.id,courseId:link.course_id,version:link.version})}>{t('Withdraw')}</button>}
 {link&&<a href={portalUrl(client.slug,'/admin/courses')}>{t('Client settings')} <ArrowUpRight size={15}/></a>}</div></div>})}
 <p className="catalogue-note">{t('Withdrawal stops new assignments. Existing progress and certificates are retained.')}</p>
 </>:<div className="catalogue-empty"><BookOpen size={36}/><p>{t('Select a master course')}</p></div>}</section></div>
 </main></div>;
}
