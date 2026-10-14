'use client';
import {BrandLogo} from '@/components/branding-provider';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {useLanguage,LanguagePicker} from '@/components/language-provider';
import { languageDirection } from '@/lib/i18n';

export default function PasswordRecoveryForm({reset = false,activation=false}:{reset?:boolean;activation?:boolean}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [token,setToken]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
  const {lang,t}=useLanguage();
  const initialized=useRef(false);
  useEffect(()=>{
    if(initialized.current)return;initialized.current=true;
    if(reset){setToken(new URLSearchParams(location.hash.slice(1)).get('token') || '');history.replaceState(null,'',location.pathname+location.search);}
    setReady(true);
  },[reset]);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setError('');
    if(reset&&password!==confirm){setError('Passwords do not match.');return;}
    setBusy(true);
    try {
      const response=await fetch('/api/password-recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reset?{action:'reset',token,password}:{action:'request',email,lang})});
      const data=await response.json();if(!response.ok)throw new Error(data.error || 'Please try again.');
      setDone(true);setPassword('');setConfirm('');setToken('');
    } catch(e){setError(e instanceof Error?e.message:'Please try again.');}
    finally{setBusy(false);}
  }
  const missing=reset&&ready&&!token&&!done;
  return <div className="shell login-screen" lang={lang} dir={languageDirection(lang)}>
    <header className="topbar"><a className="brand" href="/?login=1"><BrandLogo/></a><LanguagePicker/></header>
    <main className="main"><section className="paper entry-form password-recovery">
      <h1 className="form-heading">{t(done?(reset?'Password updated':'Check your email'):(activation?'Activate your account':reset?'Reset password':'Forgot password?'))}</h1>
      {done?<p className="auth-notice" role="status">{t(reset?'Your password has been updated. Log in with your new password.':'If an account exists for this email address, you will receive a password reset link. Check your junk folder too.')}</p>:
        missing?<p role="alert">{t(activation?'Ask the platform administrator for a new activation link.':'Open the full reset link from your email, or request a new one.')}</p>:<>
          <p>{t(activation?'Choose a password to activate your administrator account.':reset?'Choose a new password for your account.':'Enter your email address and we’ll send you a reset link.')}</p>
          <form onSubmit={submit}>
            {reset?<>
              <label>{t('Create password')}<Input name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={activation?16:8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby="reset-help"/><small id="reset-help">{t(activation?'Admin passwords need 16–128 characters.':'At least 8 characters. Platform admins need at least 16.')}</small></label>
              <label>{t('Confirm password')}<Input name="confirmPassword" type="password" dir="ltr" autoComplete="new-password" required minLength={activation?16:8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
            </>:<label>{t('Email address')}<Input name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
            {error&&<p className="error" role="alert">{t(error)}</p>}
            <Button className="blue-button" size="lg" disabled={busy||!ready}>{t(busy?'Please wait…':reset?'Save password':'Send reset link')}</Button>
          </form>
        </>}
      {reset&&!activation&&!done&&<a className="auth-help" href={`/forgot-password/?lang=${lang}`}>{t('Request a new link')}</a>}
      <a className="auth-help" href="/?login=1">{t('Back to Login')}</a>
    </section></main>
  </div>;
}
