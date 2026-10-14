import {siteInAccess} from './hierarchy-types';

import type {StoreOption} from '@/lib/store-label';
import type { ReportingAccess } from '@/lib/reporting-types';
import type {FeatureId} from '@/lib/feature-catalogue';

export type ProfileView = 'operators' | 'help' | 'integrations' | 'external-training' | 'feedback' | 'learn' | 'report' | 'courses' | 'access' | 'shots' | 'store' | 'organisation' | 'assessor' | 'pathways' | 'audit' | 'emails' | 'settings' | 'clients' | 'catalogue' | 'live-training';
export type ProfileAccount = {
  jobRole?: string|null; name: string; email: string; role: string; site: string;
  platformAdmin: boolean; platformOperator?:boolean; reportingAccess: ReportingAccess | null;
  managerStoreId?: string | null;
  adminOnly?: boolean; assessor?:boolean;
};
export type ReportFilter = { role: 'global' | 'country' | 'site' | 'unit'; unit?:string;groupBy?:string; country: string; site: string };

export const profileFeatures: Partial<Record<ProfileView, FeatureId>> = {
  integrations:'hr_integration', 'external-training':'external_training', feedback:'course_feedback', 'live-training': 'live_training', pathways: 'pathways', assessor: 'assessor', emails: 'email_notifications',
};
export function visibleProfileViews(account: ProfileAccount, features: Partial<Record<FeatureId, boolean>>) {
  return profileViews(account).filter(({value}) => (value!=='courses'||account.platformAdmin||features.client_course_management===true)&&(!profileFeatures[value] || features[profileFeatures[value]!] === true));
}
export function isPlatformView(view: ProfileView) { return view === 'operators' || view === 'clients' || view === 'catalogue' || view === 'courses'; }

export function profileViews(account: ProfileAccount): { value: ProfileView; label: string }[] {
  return [
    {value:'help' as const,label:'Help'},
    ...(account.platformAdmin||account.reportingAccess?[{value:'external-training' as const,label:'External training'}]:[]),
    ...(account.platformAdmin||account.reportingAccess?.scope==='organisation'?[{value:'feedback' as const,label:'Course feedback'}]:[]),
    ...(account.platformAdmin || account.reportingAccess ? [{value:"live-training" as const,label:"Live Training"}] : []),
    ...(account.platformOperator?[{value:'operators' as const,label:'Platform admins'},{value:'clients' as const,label:'Clients'},{value:'catalogue' as const,label:'Course Sharing'}]:[]),
    ...(account.platformAdmin || account.reportingAccess?.scope==='organisation' ? [{value:"settings" as const,label:"Settings"}, {value:"integrations" as const,label:"Integrations"}] : []),
    ...(account.platformAdmin || account.reportingAccess?.scope==='organisation' ? [{value:"emails" as const,label:"Email notifications"}] : []),
    ...(account.platformAdmin || account.reportingAccess?.scope==='organisation' ? [{value:"audit" as const,label:"Audit trail"}] : []),
    ...(account.platformAdmin || account.reportingAccess?.scope==='organisation' ? [{value:"pathways" as const,label:"Learning Pathways"}] : []),
    ...(account.assessor || account.platformAdmin ? [{value:"assessor" as const,label:"Assessor"}] : []),
    ...(!(account.adminOnly || account.platformAdmin || account.reportingAccess || account.managerStoreId) ? [{ value: 'learn' as const, label: 'My Courses' }] : []),
    ...(account.reportingAccess ? [{ value: 'report' as const, label: 'Reporting' }] : []),
    ...(!account.platformAdmin && (account.reportingAccess || account.managerStoreId) ? [{value:'access' as const,label:'Manage Users'}] : []),
    ...(!account.platformAdmin&&['organisation','country','unit'].includes(account.reportingAccess?.scope||'')?[{value:'organisation' as const,label:'Organisation'}]:[]),
    ...(!account.platformAdmin&&account.reportingAccess?.scope==='organisation'?[{value:'courses' as const,label:'Manage Courses'}]:[]),
    ...(account.platformAdmin ? [
      { value: 'courses' as const, label: 'Manage Courses' },
      { value: 'access' as const, label: 'Manage Users' },
      { value: 'organisation' as const, label: 'Organisation' },
    ] : []),
  ];
}

export function profileScope(access: ReportingAccess, desired: Partial<ReportFilter> = {}, directory:StoreOption[]=[]) {
  const stores=directory.filter(s=>siteInAccess(access,s));
  const roles: ReportFilter['role'][] = access.scope === 'organisation' ? ['global', 'country', 'site',...(desired.role==='unit'||desired.unit!==undefined?['unit' as const]:[])]
    : access.scope === 'country' ? ['country', 'site',...(desired.role==='unit'||desired.unit!==undefined?['unit' as const]:[])] : access.scope==='unit'?['unit','site']:['site'];
  const countries = ['organisation','unit'].includes(access.scope) ? [...new Set(stores.map(s => s.country))].sort() : [access.country!];
  const country = countries.includes(desired.country || '') ? desired.country! : access.country || (countries.includes('Ireland') ? 'Ireland' : countries[0]);
  const unit=desired.unit??(access.scope==='unit'&&access.unitIds?.length===1?access.unitIds[0]:'');
  const hierarchyMode=desired.unit!==undefined||access.scope==='unit'||desired.role==='unit';
  const sites = stores.filter(s => (hierarchyMode?(!unit||s.unitPath?.includes(unit)):s.country === country) && (access.scope !== 'site' || s.id === access.siteId));
  const role = desired.role && roles.includes(desired.role) ? desired.role : roles[0];
  const site = sites.some(s => s.id === desired.site) ? desired.site! : access.siteId || sites[0]?.id || '';
  return { roles, countries, sites, filter: { role, country:country||'', site,...(hierarchyMode?{unit}:{}),...(desired.groupBy!==undefined?{groupBy:desired.groupBy}:{}) } };
}

export function profileHref(view: ProfileView, filter?: ReportFilter) {
  if(view==='operators')return '/admin/operators';
  if(view==='help')return '/help';
  if(view==='external-training')return '/external-training?admin=1';
  if(view==='feedback')return '/admin/feedback';
  if (view === 'live-training') return '/live-training';
  if (view === 'clients') return '/admin/clients';
  if (view === 'catalogue') return '/admin/catalogue';
  if (view === 'integrations') return '/admin/integrations';
  if (view === 'settings') return '/admin/settings';
  if (view === 'emails') return '/admin/emails';
  if (view === 'audit') return '/audit';
  if (view === 'pathways') return '/pathways';
  if (view === 'assessor') return '/assessor';
  if (view === 'organisation') return '/admin/organisation';
  if (view === 'store') return '/store';
  if (view === 'courses') return '/admin/courses';
  if (view === 'access') return '/admin/reporting-access';
  if (view === 'shots') return '/shot-list';
  return view === 'report' ? '/?' + new URLSearchParams({ view: 'report', ...filter }) : '/?courses=1';
}

export function profileGroups(account:ProfileAccount,features:Partial<Record<FeatureId,boolean>>){
 const views=visibleProfileViews(account,features);
 const groups:{heading:string;items:ProfileView[]}[]=[
  {heading:'Learning',items:['learn']},
  {heading:'Management',items:['report','access','store','organisation']},
  {heading:'Training',items:[...(!account.platformAdmin?['courses' as const]:[]),'pathways','live-training','assessor','feedback','external-training']},
  {heading:'Configuration',items:['settings','integrations','emails','audit']},
  {heading:'Platform administration',items:['clients','operators','catalogue',...(account.platformAdmin?['courses' as const]:[])]},
  {heading:'Support',items:['help']},
 ];
 return groups.map(g=>({heading:g.heading,options:g.items.flatMap(id=>views.filter(v=>v.value===id))})).filter(g=>g.options.length);
}
