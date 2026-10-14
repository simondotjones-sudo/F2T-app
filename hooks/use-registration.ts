'use client';
import {useEffect,useState} from 'react';
import type {PublicRegistration} from '@/lib/registration-types';
export function useRegistration(){
 const [settings,setSettings]=useState<PublicRegistration|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();fetch('/api/registration',{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setSettings(d);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
 return {settings,error};
}
