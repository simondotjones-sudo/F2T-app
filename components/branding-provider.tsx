'use client';
import {createContext,useContext,useEffect,type ReactNode} from 'react';
import {DEFAULT_BRAND,type ClientBrand,themeVariables} from '@/lib/tenant-types';
const Context=createContext<ClientBrand>(DEFAULT_BRAND);
export function BrandingProvider({brand,children}:{brand:ClientBrand;children:ReactNode}){
 useEffect(()=>{
  const expected=brand.slug;
  const check=()=>{fetch('/api/client-brand',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(b=>{if(b&&(b.slug!==expected||b.revision!==brand.revision))location.reload();}).catch(()=>{});};
  window.addEventListener('focus',check);window.addEventListener('client-settings-updated',check);return()=>{window.removeEventListener('focus',check);window.removeEventListener('client-settings-updated',check);};
 },[brand.slug,brand.revision]);
 useEffect(()=>{
  if(brand.login_background)document.documentElement.style.setProperty('--login-photo',`url("${brand.login_background}")`);
  else document.documentElement.style.removeProperty('--login-photo');
  return()=>{document.documentElement.style.removeProperty('--login-photo');};
 },[brand.login_background]);
 return <Context.Provider value={brand}>{children}</Context.Provider>;
}
export const useBrand=()=>useContext(Context);
export function BrandLogo({className=''}:{className?:string}){const b=useBrand();return <img className={'client-logo '+className} src={b.logo_url} alt={b.name} width={190} height={46}/>;}
export function BrandName(){return <>{useBrand().name}</>;}
export function PassportName(){const b=useBrand();return <>{b.id===1?'Primark Safety Passport':b.name+' Learning Passport'}</>;}
