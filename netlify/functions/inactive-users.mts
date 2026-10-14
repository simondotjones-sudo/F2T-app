import {forEachTenant} from '../../lib/tenant-context';
import {backgroundJobsEnabled} from '../../lib/deployment-controls';
import {inTransaction} from '../../lib/database';
export default async()=>{
 if(!backgroundJobsEnabled())return;
 return forEachTenant(async()=>{
 const {rows:[result]}=await inTransaction(client=>client.query('SELECT auto_archive_inactive_users() AS archived'));
 console.log('Inactive learner archive check',{archived:result.archived});
 });
};
export const config={schedule:'17 * * * *'};
