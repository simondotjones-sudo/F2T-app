import {siteInAccess} from './hierarchy-types';
import type { NextRequest } from 'next/server';
import { getAdminUser } from '@/lib/admin-auth';
import { currentLearner, db } from '@/lib/server';
import { CourseError } from '@/lib/course-admin';

import type {StoreOption} from '@/lib/store-label';
import { storeDirectory } from '@/lib/store-directory';
import type { ReportingAccess } from '@/lib/reporting-types';

export async function reportingAccessFor(learnerId: string): Promise<ReportingAccess | null> {
  return db().prepare('SELECT scope,country,site_id AS "siteId",unit_ids AS "unitIds" FROM reporting_access WHERE learner_id=?')
    .bind(learnerId).first<ReportingAccess>().then(async access => {
      if (access) return access;
      const manager = await db().prepare('SELECT store_id FROM store_managers WHERE learner_id=?').bind(learnerId).first<{store_id:string}>();
      const store = manager ? (await storeDirectory()).find(s=>s.id===manager.store_id) : null;
      return store ? {scope:'site' as const,country:store.country,siteId:store.id} : null;
    });
}

export async function getReportingAccess(request: NextRequest): Promise<ReportingAccess | null> {
  if (await getAdminUser()) return { scope: 'organisation', country: null, siteId: null };
  const learner = await currentLearner(request);
  return learner ? reportingAccessFor(learner.id) : null;
}

export function reportingFilter(access: ReportingAccess, params: URLSearchParams, directory:StoreOption[]=[]) {
  const stores=directory;const storeById=new Map(stores.map(s=>[s.id,s]));
  const role = params.get('role') || (access.scope === 'organisation' ? 'global' : access.scope);
  const unit=params.get('unit')||((access.unitIds||[]).length===1?access.unitIds![0]:'');
  const country = params.get('country') || access.country || '';
  const site = params.get('site') || access.siteId || '';
  if (!['global', 'country', 'site', 'unit'].includes(role)) throw new CourseError('Choose a reporting view.');
  if (role === 'country' && !stores.some(s => s.country === country)) throw new CourseError('Choose a country.');
  if (role === 'site' && !storeById.has(site)) throw new CourseError('Choose a store.');
  if (access.scope === 'site' && (role !== 'site' || site !== access.siteId))
    throw new CourseError('Reporting is limited to your assigned site.', 403);
  if (access.scope === 'country' && (role === 'global' || (role === 'country' ? country !== access.country : role==='site' && storeById.get(site)?.country !== access.country)))
    throw new CourseError('Reporting is limited to your assigned country.', 403);
  if(role==='unit'&&!unit&&access.scope!=='unit')throw new CourseError('Choose an organisation group.');
  if(access.scope==='unit'&&(role==='global'||role==='country'))throw new CourseError('Reporting is limited to your assigned groups.',403);
  const chosen=role==='unit'?stores.filter(s=>unit?s.unitPath?.includes(unit):siteInAccess(access,s)):role==='site'?stores.filter(s=>s.id===site):role==='country'?stores.filter(s=>s.country===country):stores;
  if(chosen.some(s=>!siteInAccess(access,s)))throw new CourseError('Reporting is limited to your assigned groups.',403);
  // An unknown or empty group returns no records, never a global fallback.
  const ids = role==='global'?null:chosen.map(s=>s.id);
  return { role, country, site, unit, siteIds: ids };
}
