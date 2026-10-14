'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {useFeatures} from '@/hooks/use-features';
import {useLanguage} from '@/components/language-provider';
import type {FeatureId} from '@/lib/feature-catalogue';

export function FeatureBoundary({feature,children}:{feature:FeatureId;children:ReactNode}) {
 const features=useFeatures(),disabled=features[feature]===false;
 useEffect(()=>{if(disabled)location.replace('/?featureUnavailable=1');},[disabled]);
 return disabled?null:children;
}

export function FeatureUnavailableNotice(){
 const {t}=useLanguage();
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  const url=new URL(location.href);
  if(url.searchParams.get('featureUnavailable')!=='1')return;
  setVisible(true);url.searchParams.delete('featureUnavailable');history.replaceState(history.state,'',url);
 },[]);
 return visible?<div className="feature-unavailable-notice" role="status"><span>{t('This feature is switched off in Settings.')}</span><button type="button" onClick={()=>setVisible(false)}>{t('Close')}</button></div>:null;
}
