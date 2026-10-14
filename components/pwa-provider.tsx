'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {useBrand,BrandLogo} from './branding-provider';
import {usePathname} from 'next/navigation';
import {Download,X} from 'lucide-react';
import {useLanguage} from './language-provider';
import './pwa.css';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
const Context=createContext<{prompt:InstallPrompt|null;installed:boolean;ios:boolean;clear:()=>void}>({prompt:null,installed:false,ios:false,clear:()=>{}});
export function PwaProvider({children}:{children:ReactNode}){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(false),[ios,setIos]=useState(false),[offline,setOffline]=useState(false);
 const {t}=useLanguage();
 useEffect(()=>{
  const media=matchMedia('(display-mode: standalone)');
  const sync=()=>setInstalled(media.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));sync();
  setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
  const before=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);};
  const added=()=>{setInstalled(true);setPrompt(null);};
  const connectivity=()=>setOffline(!navigator.onLine);connectivity();
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',added);media.addEventListener('change',sync);
  window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
  let registration:ServiceWorkerRegistration|undefined,cancelled=false;
  if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator&&window.isSecureContext){
   navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(value=>{if(!cancelled){registration=value;void value.update().catch(()=>{});}}).catch(()=>{});
  }
  const update=()=>{if(document.visibilityState==='visible')void registration?.update().catch(()=>{});};
  document.addEventListener('visibilitychange',update);
  return()=>{cancelled=true;document.removeEventListener('visibilitychange',update);window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',added);media.removeEventListener('change',sync);window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);};
 },[]);
 return <Context.Provider value={{prompt,installed,ios,clear:()=>setPrompt(null)}}>{offline&&<div className="pwa-offline-status" role="status">{t('You are offline. Reconnect before continuing training or saving changes.')}</div>}{children}<PwaInstallBanner/></Context.Provider>;
}
export function PwaInstallButton(){
 const {prompt,installed,ios,clear}=useContext(Context),{t}=useLanguage();
 const [help,setHelp]=useState(false),[busy,setBusy]=useState(false);
 if(installed)return null;
 async function install(){
  if(!prompt){setHelp(!help);return;}
  setBusy(true);
  try{await prompt.prompt();await prompt.userChoice;clear();}catch{setHelp(true);clear();}finally{setBusy(false);}
 }
 return <div className="pwa-install"><button type="button" className="profile-link" disabled={busy} onClick={()=>void install()} aria-expanded={help}><Download size={19}/><span>{t('Install app')}</span></button>{help&&<p className="pwa-install-help" role="status">{t(ios?'Open this portal in Safari, tap Share, then Add to Home Screen.':'Use your browser menu to install this app. If installation is unavailable, you can keep using it in your browser.')}</p>}</div>;
}

function PwaInstallBanner(){
 const {prompt,installed,ios,clear}=useContext(Context),{t}=useLanguage(),brand=useBrand(),path=usePathname();
 const [ready,setReady]=useState(false),[dismissed,setDismissed]=useState(true),[help,setHelp]=useState(false),[busy,setBusy]=useState(false);
 const key='pwa-install-dismissed:'+brand.slug;
 useEffect(()=>{
  setReady(false);setHelp(false);
  try{setDismissed(Number(localStorage.getItem(key)||0)>Date.now());}catch{setDismissed(false);}
  const timer=setTimeout(()=>setReady(true),2500);return()=>clearTimeout(timer);
 },[key]);
 function dismiss(){setDismissed(true);try{localStorage.setItem(key,String(Date.now()+7*86400000));}catch{}}
 async function install(){
  if(!prompt){setHelp(true);return;}
  setBusy(true);
  try{await prompt.prompt();const choice=await prompt.userChoice;clear();if(choice.outcome==='accepted'||choice.outcome==='dismissed')dismiss();}
  catch{clear();setHelp(true);}finally{setBusy(false);}
 }
 // Do not interrupt lessons, assessments or password/account activation flows.
 if(!ready||installed||dismissed||/^\/(learn|assessment|activate-account|reset-password|platform-access)(\/|$)/.test(path))return null;
 return <aside className="pwa-install-banner" aria-label={t('Install app')}><BrandLogo/><button type="button" className="pwa-banner-close" aria-label={t('Close')} disabled={busy} onClick={dismiss}><X size={20}/></button><strong>{t('Install app')}</strong><p>{brand.name}</p>{help?<p role="status">{t(ios?'Open this portal in Safari, tap Share, then Add to Home Screen.':'Use your browser menu to install this app. If installation is unavailable, you can keep using it in your browser.')}</p>:null}<div className="pwa-banner-actions"><button type="button" className="blue-button" disabled={busy} onClick={()=>void install()}><Download size={18}/>{t('Install app')}</button><button type="button" disabled={busy} onClick={dismiss}>{t('Not now')}</button></div></aside>;
}
