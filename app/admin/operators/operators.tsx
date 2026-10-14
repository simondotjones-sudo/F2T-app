'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import {Plus,Copy,ShieldCheck} from 'lucide-react';
import PageHeader from '@/components/page-header';
import {useLanguage} from '@/components/language-provider';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {DEFAULT_BRAND,themeVariables} from '@/lib/tenant-types';
import './operators.css';

type Operator={email:string;name:string;status:'active'|'pending'|'disabled';bootstrap:boolean;code_expires_at:string|null};
type Handoff={email:string;code:string;expiresAt:string;loginPath:string};
export default function Operators(){
 const {t,lang}=useLanguage();
 const [operators,setOperators]=useState<Operator[]>([]),[currentEmail,setCurrentEmail]=useState('');
 const [adding,setAdding]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[search,setSearch]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [handoff,setHandoff]=useState<Handoff|null>(null),[disabling,setDisabling]=useState<string|null>(null);
 async function refresh(){const r=await fetch('/api/admin/operators',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setOperators(d.operators);setCurrentEmail(d.currentEmail);}
 useEffect(()=>{let active=true;fetch('/api/admin/operators',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active){setOperators(d.operators);setCurrentEmail(d.currentEmail);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 async function change(action:string,targetEmail:string){
  setBusy(true);setError('');setCopied(false);setHandoff(null);
  try{
   const r=await fetch('/api/admin/operators',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,email:targetEmail,name})}),d=await r.json();
   if(!r.ok)throw Error(d.error);
   if(d.code)setHandoff(d);
   setAdding(false);setDisabling(null);setName('');setEmail('');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
 }
 async function copy(){if(!handoff)return;try{await navigator.clipboard.writeText(handoff.code);setCopied(true);}catch{setError('Could not copy. Select and copy the code below.');}}
 const status=(o:Operator)=>o.status==='active'?'Active':o.status==='disabled'?'Disabled':o.code_expires_at&&new Date(o.code_expires_at)<new Date()?'Expired':'Pending';
 return <div className="shell operators-shell" style={themeVariables(DEFAULT_BRAND.theme_color) as CSSProperties}>
  <PageHeader title={t('Platform admins')} view="operators"/>
  <main className="operators-main">
   <div className="operators-toolbar"><Button className="blue-button" disabled={busy||loading} onClick={()=>{setAdding(true);setHandoff(null);setError('');}}><Plus size={18}/>{t('Add platform admin')}</Button><Input type="search" aria-label={t('Search')} placeholder={t('Search')} value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <p className="operators-scope"><ShieldCheck size={18}/>{t('Platform admins can manage every client and all platform settings.')}</p>
   {error&&<p className="error" role="alert">{t(error)}</p>}
   {adding&&<section className="paper operator-form"><h2>{t('Add platform admin')}</h2><form onSubmit={e=>{e.preventDefault();void change('create',email);}}><fieldset disabled={busy}><div className="operator-fields"><label>{t('Name')}<Input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></label><label>{t('Email address')}<Input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off"/></label></div><div className="operator-actions"><Button className="blue-button" type="submit">{t(busy?'Please wait…':'Create login code')}</Button><Button type="button" variant="outline" onClick={()=>setAdding(false)}>{t('Cancel')}</Button></div></fieldset></form></section>}
   {handoff&&<section className="paper operator-handoff" aria-label={t('Login code')}><h2>{t('Share this login code privately')}</h2><p><strong>{handoff.email}</strong></p><p>{t('Single use. Expires in 7 days. No email has been sent.')}</p><label>{t('Login code')}<Input readOnly dir="ltr" className="operator-code" value={handoff.code} onFocus={e=>e.target.select()}/></label><div className="operator-actions"><Button className="blue-button" onClick={()=>void copy()}><Copy size={16}/>{t(copied?'Copied':'Copy code')}</Button></div><label>{t('Login page')}<Input readOnly dir="ltr" value={typeof location==='undefined'?'':location.origin+handoff.loginPath} onFocus={e=>e.target.select()}/></label><p>{t('Enter your email and code, then choose your password.')}</p><p>{t('Expires')}: {new Date(handoff.expiresAt).toLocaleString(lang)}</p><Button variant="outline" onClick={()=>setHandoff(null)}>{t('Close')}</Button></section>}
   {loading?<p role="status">{t('Loading…')}</p>:<div className="operators-list">{operators.filter(o=>(o.name+' '+o.email).toLowerCase().includes(search.toLowerCase())).map(o=><article className="paper operator-card" key={o.email}><div className="operator-identity"><h2>{o.name}</h2>{o.name!==o.email&&<p>{o.email}</p>}<span className={'operator-status status-'+o.status}>{t(status(o))}</span>{o.bootstrap&&<small>{t('Primary platform admin')}</small>}</div>{!o.bootstrap&&o.email!==currentEmail&&<div className="operator-actions"><Button variant="outline" disabled={busy} onClick={()=>void change('code',o.email)}>{t('Create login code')}</Button>{o.status!=='disabled'&&<Button variant="outline" disabled={busy} onClick={()=>setDisabling(o.email)}>{t('Disable access')}</Button>}</div>}{disabling===o.email&&<div className="operator-confirm"><p>{t('Disable access and cancel all login codes and sessions?')}</p><div className="operator-actions"><Button disabled={busy} onClick={()=>void change('disable',o.email)}>{t('Disable access')}</Button><Button variant="outline" disabled={busy} onClick={()=>setDisabling(null)}>{t('Cancel')}</Button></div></div>}</article>)}</div>}
  </main>
 </div>;
}
