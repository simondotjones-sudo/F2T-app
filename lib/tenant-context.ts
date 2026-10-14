import {AsyncLocalStorage} from 'node:async_hooks';
import {cookies,headers} from 'next/headers';
import {cache} from 'react';
import {notFound} from 'next/navigation';
import {controlQuery} from './control-database';
import {DEFAULT_BRAND,type Tenant} from './tenant-types';
const jobContext=new AsyncLocalStorage<Tenant>();
export const CLIENT_COOKIE='lms_client';
export async function tenantBySlug(slug:string):Promise<Tenant|null>{
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length>60)return null;
 const row=(await controlQuery<Tenant>('SELECT * FROM public.lms_clients WHERE slug=$1 AND active',[slug])).rows[0];
 return row?{...row,id:Number(row.id)}:null;
}
const requestTenant=cache(async()=>{
 const h=await headers();const jar=await cookies();
 // The proxy removes any incoming selector header and supplies its own value.
 const slug=h.get('x-lms-client')||jar.get(CLIENT_COOKIE)?.value||DEFAULT_BRAND.slug;
 const tenant=await tenantBySlug(slug);
 if(!tenant)notFound();
 return tenant;
});
export async function currentTenant():Promise<Tenant>{return jobContext.getStore()||requestTenant();}
export function withTenant<T>(tenant:Tenant,operation:()=>Promise<T>){return jobContext.run(tenant,operation);}
export async function forEachTenant(operation:()=>Promise<unknown>){
 const clients=(await controlQuery<Tenant>('SELECT * FROM public.lms_clients WHERE active ORDER BY id')).rows;
 const results=[];
 for(const row of clients){const tenant={...row,id:Number(row.id)};try{results.push({clientId:tenant.id,result:await withTenant(tenant,operation)});}catch(error){console.error('Client job failed',{clientId:tenant.id,error});results.push({clientId:tenant.id,failed:true});}}
 return results;
}
