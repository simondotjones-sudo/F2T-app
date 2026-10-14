'use client';
import {useLanguage} from './language-provider';
import {tr} from '@/lib/ui-copy';
import {languageOptions,type Language} from '@/lib/i18n';
import type {LocationTerm} from '@/lib/tenant-types';
type Preferences={default_language?:Language;location_term?:LocationTerm|null};
export default function ClientPreferencesFields({value,onChange}:{value:Preferences;onChange:(value:Preferences)=>void}){
 const {lang}=useLanguage();
 // These option names must not be rewritten by the currently selected terminology.
 const t=(key:string)=>tr(lang,key);
 return <section className="client-preferences"><h3>{t('Language & terminology')}</h3><div className="setup-two">
  <label>{t('Location terminology')}<select value={value.location_term??''} onChange={e=>onChange({location_term:(e.target.value||null) as LocationTerm|null})}>
   {value.location_term==null&&<option value="">{t('Keep current wording')}</option>}
   <option value="site">{t('Sites')}</option><option value="store">{t('Stores')}</option>
  </select></label>
  <label>{t('Default language')}<select value={value.default_language??'en'} onChange={e=>onChange({default_language:e.target.value as Language})}>
   {languageOptions.map(option=><option key={option.code} value={option.code}>{option.name}</option>)}
  </select></label>
 </div><p className="setup-note">{t('Users start in this language and can choose another. Course content keeps its own language.')}</p></section>;
}
