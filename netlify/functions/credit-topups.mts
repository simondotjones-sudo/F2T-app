import {forEachTenant} from '../../lib/tenant-context';
import {backgroundJobsEnabled} from '../../lib/deployment-controls';
import {inTransaction} from '../../lib/database';
// Scheduled functions have no public HTTP endpoint. Dates are evaluated in the
// corporate accounting timezone, including DST and the 35-day final period.
export default async()=>{
 if(!backgroundJobsEnabled())return;
 return forEachTenant(async()=>{
 const result=await inTransaction(client=>client.query('SELECT store_id,topup_store_credits(store_id) AS added FROM store_credit_accounts WHERE active ORDER BY store_id'));
 console.log('Credit top-ups checked',{stores:result.rows.length,creditsAdded:result.rows.reduce((n:number,r)=>n+Number(r.added),0)});
 });
};
export const config={schedule:'@hourly'};
