'use client';
import {useLanguage} from './language-provider';
import {NativeSelect} from './ui/native-select';
import {UnitSelect} from './hierarchy-fields';
import type {OrganisationHierarchy} from '@/lib/hierarchy-types';
import {siteInAccess,reportGrouping,reportLevels} from '@/lib/hierarchy-types';
import type {ReportingAccess} from '@/lib/reporting-types';
import type {DirectoryStore} from '@/lib/store-directory';
import type {ReportFilter} from '@/lib/profile';
import {storeLabel} from '@/lib/store-label';
import './hierarchy.css';
export {reportGrouping} from '@/lib/hierarchy-types';
export default function HierarchyReportScope({hierarchy:h,access,filter,stores,onChange,groupingEnabled=true}:{groupingEnabled?:boolean;hierarchy:OrganisationHierarchy;access:ReportingAccess;filter:ReportFilter;stores:DirectoryStore[];onChange:(f:ReportFilter)=>void}){
 const {t}=useLanguage(),unit=h.units.find(u=>u.id===filter.unit),root=access.scope==='organisation'?h.config.labels[0]:'Your groups';
 const sites=stores.filter(s=>siteInAccess(access,s)&&(!filter.unit||s.unitPath?.includes(filter.unit)));
 const groupBy=reportGrouping(h,filter);
 function selectUnit(id:string){onChange({...filter,role:id?'unit':access.scope==='organisation'?'global':access.scope==='country'?'country':'unit',unit:id,site:'',groupBy:''});}
 if(access.scope==='site')return <nav className="hierarchy-breadcrumb" aria-label={t('Reporting scope')}>{stores.find(s=>s.id===access.siteId)?.name||t('Store')}</nav>;
 return <div className="hierarchy-scope"><label>{t('Reporting scope')}<UnitSelect units={h.units} value={filter.unit||''} onChange={selectUnit} rootLabel={root}/></label><label>{t(h.config.labels.at(-1)!)}<NativeSelect value={filter.role==='site'?filter.site:''} onChange={e=>{if(!e.target.value)selectUnit(filter.unit||'');else onChange({...filter,role:'site',site:e.target.value,country:sites.find(s=>s.id===e.target.value)?.country||''});}}><option value="">{t('All stores')}</option>{sites.map(s=><option key={s.id} value={s.id}>{storeLabel(s)}</option>)}</NativeSelect></label><label>{t('View by')}<NativeSelect disabled={filter.role==='site'||!groupingEnabled} value={groupingEnabled?groupBy:h.config.labels.length-1} onChange={e=>onChange({...filter,groupBy:e.target.value})}>{reportLevels(h,filter).map(i=><option key={i} value={i}>{t(h.config.labels[i])}</option>)}</NativeSelect></label><nav className="hierarchy-breadcrumb" aria-label={t('Reporting scope')}><button type="button" onClick={()=>selectUnit('')}>{t(root)}</button>{unit?.path.map((id,i)=><span key={id}> / {h.units.some(u=>u.id===id)?<button type="button" onClick={()=>selectUnit(id)}>{unit.pathNames[i]}</button>:unit.pathNames[i]}</span>)}{filter.role==='site'&&<span> / {sites.find(s=>s.id===filter.site)?.name}</span>}</nav></div>;
}
