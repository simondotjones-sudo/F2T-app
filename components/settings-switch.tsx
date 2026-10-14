'use client';
import {useLanguage} from '@/components/language-provider';
import './settings-switch.css';

type Props={label:string;checked:boolean;disabled?:boolean;onCheckedChange:(checked:boolean)=>void};
export default function SettingsSwitch({label,checked,disabled,onCheckedChange}:Props){
 const {t}=useLanguage();
 return <div className="feature-state"><button type="button" className="feature-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={()=>onCheckedChange(!checked)}><span/></button><span>{t(checked?'On':'Off')}</span></div>;
}
