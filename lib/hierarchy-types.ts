import type {ReportingAccess} from './reporting-types';
export type HierarchyConfig={labels:string[];countryLevel:number|null;revision:number;primarkLocked:boolean};
export type OrganisationUnit={id:string;name:string;code:string;level:number;parentId:string|null;country:string|null;revision:number;path:string[];pathNames:string[]};
export type OrganisationHierarchy={config:HierarchyConfig;units:OrganisationUnit[]};
export type HierarchySite={id:string;country:string;parentUnitId?:string|null;unitPath?:string[]};
export const defaultHierarchy:HierarchyConfig={labels:['Organisation','Site'],countryLevel:null,revision:1,primarkLocked:false};
export function siteInAccess(access:ReportingAccess,site:HierarchySite){
 return access.scope==='organisation'||(access.scope==='country'?site.country===access.country:access.scope==='unit'?(access.unitIds||[]).some(id=>site.unitPath?.includes(id)):site.id===access.siteId);
}
export function unitInAccess(access:ReportingAccess,unit:OrganisationUnit,units:OrganisationUnit[]){
 if(access.scope==='organisation')return true;
 if(access.scope==='unit')return (access.unitIds||[]).some(id=>unit.path.includes(id));
 if(access.scope==='country')return unit.path.some(id=>units.some(u=>u.id===id&&u.country===access.country));
 return false;
}
export function hierarchyPath(unit:OrganisationUnit){return unit.pathNames.join(' / ');}
export function reportLevels(h:OrganisationHierarchy,filter:{unit?:string}){
 const level=h.units.find(u=>u.id===filter.unit)?.level||0;
 return [...new Set([...h.units.filter(u=>u.level>level&&(!filter.unit||u.path.includes(filter.unit))).map(u=>u.level),h.config.labels.length-1])].sort((a,b)=>a-b);
}
export function reportGrouping(h:OrganisationHierarchy,filter:{unit?:string;groupBy?:string}){
 const levels=reportLevels(h,filter),requested=Number(filter.groupBy);
 return filter.groupBy&&levels.includes(requested)?requested:levels[0];
}
