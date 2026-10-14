'use client';
import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {useState,type CSSProperties} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {useLanguage,LanguagePicker} from '@/components/language-provider';
import {DEFAULT_BRAND,themeVariables} from '@/lib/tenant-types';
export default function PlatformAccess(){
 const {t,lang}=useLanguage();const router=useRouter();
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');if(password!==confirm){setError('Passwords do not match.');return;}setBusy(true);
  try{
   const r=await fetch('/api/platform-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code,password})}),d=await r.json();if(!r.ok)throw Error(d.error);
   setDone(true);setCode('');setPassword('');setConfirm('');
   const login=await fetch('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnTo:'/admin/clients'})});
   if(login.ok)router.replace('/admin/clients');
  }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
 }
 return <div className="shell login-screen" lang={lang} dir={lang==='ar'?'rtl':'ltr'} style={themeVariables(DEFAULT_BRAND.theme_color) as CSSProperties}><header className="topbar"><Link className="brand" href="/?login=1"><Image unoptimized className="client-logo" src={DEFAULT_BRAND.logo_url} alt={'Fit2Trade'} width={190} height={46}/></Link><LanguagePicker/></header><main className="main"><section className="paper entry-form password-recovery"><h1 className="form-heading">{t('Use a platform admin code')}</h1>{done?<p role="status">{t('Your password has been updated. Log in with your new password.')}</p>:<><p>{t('Enter your email and code, then choose your password.')}</p><form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0,display:'grid',gap:'1rem'}}><label>{t('Email address')}<Input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{t('Login code')}<Input dir="ltr" autoComplete="one-time-code" spellCheck={false} required maxLength={100} value={code} onChange={e=>setCode(e.target.value)}/></label><label>{t('Create password')}<Input type="password" autoComplete="new-password" required minLength={16} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby="platform-password-help"/><small id="platform-password-help">{t('Admin passwords need 16–128 characters.')}</small></label><label>{t('Confirm password')}<Input type="password" autoComplete="new-password" required minLength={16} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><Button className="blue-button" type="submit">{t(busy?'Please wait…':'Save password & login')}</Button></fieldset></form></>}{error&&<p className="error" role="alert">{t(error)}</p>}<Link className="auth-help" href="/?login=1">{t('Back to Login')}</Link></section></main></div>;
}
