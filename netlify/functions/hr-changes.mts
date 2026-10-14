import {forEachTenant} from '../../lib/tenant-context';
import {backgroundJobsEnabled} from '../../lib/deployment-controls';
import {runScheduledHr} from '../../lib/hr-integration';
export default async()=>{if(backgroundJobsEnabled())return forEachTenant(runScheduledHr);};
export const config={schedule:'*/5 * * * *'};
