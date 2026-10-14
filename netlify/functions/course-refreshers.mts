import {forEachTenant} from '../../lib/tenant-context';
import {backgroundJobsEnabled} from '../../lib/deployment-controls';
import {syncCourseRefreshers} from '../../lib/course-refreshers';
// Runs on published deployments every 15 minutes, UTC; no public endpoint.
export default async()=>{
 if(!backgroundJobsEnabled())return;
 return forEachTenant(async()=>{
 console.log('Course refreshers checked',await syncCourseRefreshers());
 });
};
export const config={schedule:'*/15 * * * *'};
