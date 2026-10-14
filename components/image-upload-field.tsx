 'use client';
import {useState} from 'react';
import {useLanguage} from './language-provider';
import {prepareImage} from '@/lib/image-upload';
import {Button} from './ui/button';
import './image-upload-field.css';
export default function ImageUploadField({label,value,onChange,onBusy,disabled=false,subtle=false}:{label:string;value?:string|null;onChange:(value:string|null)=>void;onBusy:(busy:boolean)=>void;disabled?:boolean;subtle?:boolean}){
 const {t}=useLanguage(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function upload(file:File){setBusy(true);onBusy(true);setError('');try{onChange(await prepareImage(file,subtle?1600:900));}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}}
 return <div className="image-upload-field"><label>{t(label)}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/></label><small>{t('PNG, JPEG or WebP · Up to 5 MB')}</small>{value&&<><div className={'uploaded-image-preview'+(subtle?' subtle':'')}><img src={value} alt={t('Preview')}/></div><Button type="button" variant="outline" disabled={disabled||busy} onClick={()=>{setError('');onChange(null);}}>{t('Remove image')}</Button></>}{busy&&<p role="status">{t('Please wait…')}</p>}{error&&<p className="error" role="alert">{t(error)}</p>}</div>;
}
