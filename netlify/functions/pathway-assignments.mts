import {forEachTenant} from '../../lib/tenant-context';
import {backgroundJobsEnabled} from '../../lib/deployment-controls';
import {inTransaction} from '../../lib/database';
// Catch future start dates and retry credit/course failures even when learners are offline.
export default async()=>{
 if(!backgroundJobsEnabled())return;
 return forEachTenant(async()=>{
 const {rows:[result]}=await inTransaction(client=>client.query('SELECT sync_pathway_assignments() AS assigned'));
 console.log('Automatic pathway assignments checked',{assigned:result.assigned});
 });
};
export const config={schedule:'7,22,37,52 * * * *'};
