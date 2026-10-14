import {forEachTenant} from '../../lib/tenant-context';
import {backgroundJobsEnabled} from '../../lib/deployment-controls';
import {runEmailNotifications} from '../../lib/email-worker';
export default async()=>{
 if(!backgroundJobsEnabled())return;
 return forEachTenant(async()=>{
 const result=await runEmailNotifications();
 console.log('Learning email processing',result);
 });
};
export const config={schedule:'11,26,41,56 * * * *'};
