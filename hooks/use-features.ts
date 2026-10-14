'use client';
import {useEffect,useState} from 'react';
import type {FeatureId} from '@/lib/feature-catalogue';
import {useBrand} from '@/components/branding-provider';
export function useFeatures(){
 const {slug}=useBrand();
 const [state,setState]=useState<{slug:string;features:Partial<Record<FeatureId,boolean>>}>({slug,features:{}});
 useEffect(()=>{
  let active=true,version=0;
  const load=async()=>{
   const request=++version;
   try{
    const response=await fetch('/api/features',{cache:'no-store'});
    const data=response.ok?await response.json():null;
    if(active&&request===version)setState({slug,features:data?.features||{}});
   }catch{if(active&&request===version)setState({slug,features:{}});}
  };
  void load();window.addEventListener('focus',load);window.addEventListener('features-updated',load);
  return()=>{active=false;window.removeEventListener('focus',load);window.removeEventListener('features-updated',load);};
 },[slug]);
 return state.slug===slug?state.features:{};
}
