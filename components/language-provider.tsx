'use client';
import {createContext,useContext,useEffect,useMemo,useState,useCallback} from 'react';
import {useBrand} from './branding-provider';
import {languagePreferenceKey,resolveClientLanguage} from '@/lib/client-preferences';
import type {LocationTerm} from '@/lib/tenant-types';
import {Globe2} from 'lucide-react';
import {isLanguage,languageDirection,languageLocale,languageOptions,type Language} from '@/lib/i18n';
import {countryName,formatDate,tr,type LocalizedText} from '@/lib/ui-copy';


type Values=Record<string,string|number>;
const makeLanguage=(lang:Language,setLang:(lang:Language)=>void,locationTerm?:LocationTerm|null)=>({lang,setLang,t:(key:LocalizedText,values?:Values)=>tr(lang,key,values,locationTerm),country:(value:string)=>countryName(value,lang),date:(value:string|null)=>formatDate(value,lang),duration:(value:number)=>new Intl.NumberFormat(languageLocale(lang),{style:'unit',unit:'minute',unitDisplay:'short'}).format(value),languageName:(code:string)=>{try{return new Intl.DisplayNames([languageLocale(lang)],{type:'language'}).of(code)||code;}catch{return code;}}});
const Context=createContext(makeLanguage('en',()=>{}));
export function LanguageProvider({children}:{children:React.ReactNode}){
  const brand=useBrand(),key=languagePreferenceKey(brand.slug);
  const [lang,updateLang]=useState<Language>(brand.default_language??'en'),[ready,setReady]=useState(false);
  const setLang=useCallback((value:Language)=>{
    updateLang(value);
    try{localStorage.setItem(key,value);}catch{}
  },[key]);
  useEffect(()=>{
    const query=new URLSearchParams(location.search).get('lang');
    let saved:string|null=null,legacy:string|null=null;
    try{saved=localStorage.getItem(key);legacy=localStorage.getItem('primark-language');}catch{}
    updateLang(resolveClientLanguage(brand,saved,query,legacy));setReady(true);
    // Preserve an old non-English choice, without freezing an automatically saved English default.
    if(!isLanguage(saved)&&brand.location_term==null&&(brand.default_language??'en')==='en'&&isLanguage(legacy)&&legacy!=='en'){try{localStorage.setItem(key,legacy);}catch{}}
    const sync=(event:StorageEvent)=>{if(event.key===key||event.key===null)updateLang(resolveClientLanguage(brand,event.newValue,null));};
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[key,brand.default_language,brand.location_term]);
  useEffect(()=>{
    if(!ready)return;
    document.documentElement.lang=lang;document.documentElement.dir=languageDirection(lang);
    const url=new URL(location.href);if(url.searchParams.has('lang')&&url.searchParams.get('lang')!==lang){url.searchParams.set('lang',lang);history.replaceState(history.state,'',url);}
  },[lang,ready]);
  const value=useMemo(()=>makeLanguage(lang,setLang,brand.location_term),[lang,setLang,brand.location_term]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLanguage=()=>useContext(Context);
export function LanguagePicker(){const {lang,setLang,t}=useLanguage();return <label className="language-picker"><Globe2 size={17}/><span className="sr-only">{t('Language')}</span><select aria-label={t('Language')} value={lang} onChange={e=>setLang(e.target.value as Language)}>{languageOptions.map(option=><option key={option.code} value={option.code} lang={option.code} dir={languageDirection(option.code)}>{option.name}</option>)}</select></label>;}
export function Text({children}:{children:string}){return <>{useLanguage().t(children)}</>;}
