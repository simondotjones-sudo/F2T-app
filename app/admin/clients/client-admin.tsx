'use client';
import ClientSetupWizard from '@/components/client-setup-wizard';
import ClientEditWizard from '@/components/client-edit-wizard';
import ClientAdminActivation from '@/components/client-admin-activation';
import {useEffect,useState,type CSSProperties} from 'react';
import {Plus,ArrowUpRight,Settings2,Search,Check} from 'lucide-react';
import {useLanguage} from '@/components/language-provider';
import PageHeader from '@/components/page-header';
import {DEFAULT_BRAND,portalUrl,themeVariables,type ClientBrand} from '@/lib/tenant-types';
import './clients.css';
type ClientSummary=ClientBrand&{setup_completed_at?:string|null};
export default function ClientAdmin(){
 const {t}=useLanguage();const [wizard,setWizard]=useState(false),[editing,setEditing]=useState<number|null>(null),[activationId,setActivationId]=useState<number|null>(null);
 const [clients,setClients]=useState<ClientSummary[]>([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState('');
 async function refresh(){const r=await fetch('/api/admin/clients',{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error);setClients(d.clients);}
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
 function edit(id:number){setEditing(id);setError('');setSaved('');}
 return <div className="shell clients-shell" style={themeVariables(DEFAULT_BRAND.theme_color) as CSSProperties}><PageHeader title={t('Clients')} view="clients"/>
 <main className="clients-main">{wizard?<ClientSetupWizard onClose={()=>setWizard(false)} onCreated={()=>{void refresh().catch(e=>setError(e.message));}}/>:editing!==null?<ClientEditWizard key={editing} id={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setSaved(t('Settings saved.'));void refresh().catch(e=>setError(e.message));}}/>:<>
 <div className="clients-toolbar"><button className="blue-button" onClick={()=>{setWizard(true);setError('');setSaved('');}}><Plus size={18}/> {t('Add client')}</button><div className="clients-search"><input type="search" aria-label={t('Search clients')} placeholder={t('Search clients')} value={search} onChange={e=>setSearch(e.target.value)}/><Search size={19}/></div></div>
 {error&&<p className="error" role="alert">{t(error)}</p>}{saved&&<p className="clients-success" role="status"><Check size={18}/>{saved}</p>}
 <div className="clients-grid">{clients.filter(c=>(c.name+' '+c.slug).toLowerCase().includes(search.toLowerCase())).map(c=><article className="client-card" key={c.id} style={{'--client-colour':c.theme_color} as CSSProperties}><div className="client-card-top"><img src={c.logo_url} alt={c.name}/><span>{t('Client {id}',{id:c.id})}</span></div><h3><button type="button" className="client-card-open" aria-label={t('Edit client')+': '+c.name} onClick={()=>edit(c.id)}>{c.name}</button></h3><p>{'?client='+c.slug}</p><button className="client-copy-link" onClick={()=>{navigator.clipboard.writeText(location.origin+portalUrl(c.slug,'/?login=1')).then(()=>setSaved(t('Portal link copied.'))).catch(()=>setError(t('Could not copy the link. Open the client and copy its address.')));}}>{t('Copy portal link')}</button>{c.setup_completed_at&&<button className="client-copy-link client-activation-link" onClick={()=>setActivationId(c.id)}>{t('First administrator')}</button>}<div className="client-theme"><i style={{background:c.theme_color}}/>{c.theme_color.toUpperCase()}</div><div className="client-card-actions"><button onClick={()=>edit(c.id)}><Settings2 size={17}/> {t('Edit client')}</button><a href={portalUrl(c.slug,'/?view=report')}>{t('Open client')} <ArrowUpRight size={17}/></a></div></article>)}</div>
 </>}{activationId!==null&&<ClientAdminActivation id={activationId} onClose={()=>setActivationId(null)}/>}</main></div>;
}
