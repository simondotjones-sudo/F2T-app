'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {useLanguage} from './language-provider';
type Status={name:string;email:string;activated:boolean;activationPath:string|null;expiresAt:string|null};
export default function ClientAdminActivation({id,onClose}:{id:number;onClose:()=>void}){
 const {t}=useLanguage(),[state,setState]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 useEffect(()=>{fetch('/api/admin/clients/activation?id='+id,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setState(d);}).catch(e=>setError(e.message));},[id]);
 async function create(){setBusy(true);setError('');setCopied(false);try{const r=await fetch('/api/admin/clients/activation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}),d=await r.json();if(!r.ok)throw Error(d.error);setState(d);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>{t('First administrator')}</DialogTitle><DialogDescription>{state?state.name+' · '+state.email:t('Loading…')}</DialogDescription></DialogHeader>{error&&<p className="error" role="alert">{t(error)}</p>}{state&&(state.activated?<p className="admin-success">{t('Administrator account activated')}</p>:<><p>{t('Share this single-use link privately with the administrator. It expires in 7 days. No email has been sent.')}</p>{state.activationPath?<><Input readOnly aria-label={t('Administrator activation link')} value={location.origin+state.activationPath}/><Button onClick={()=>navigator.clipboard.writeText(location.origin+state.activationPath).then(()=>setCopied(true)).catch(()=>setError('Could not copy the link. Select and copy it below.'))}>{t(copied?'Copied':'Copy activation link')}</Button></>:<><p>{t('Creating a new link invalidates the previous activation link.')}</p><Button disabled={busy} onClick={()=>void create()}>{t(busy?'Please wait…':'Create activation link')}</Button></>}</>)}</DialogContent></Dialog>;
}
