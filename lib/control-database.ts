import {databaseDriver} from './database-driver';
// Privileged control-plane queries. Never pass SQL supplied by a request here.
// Callers authorise platform operations before invoking this adapter.
export async function controlQuery<T=Record<string,unknown>>(sql:string,values:unknown[]=[]):Promise<{rows:T[];rowCount:number|null}>{
 return databaseDriver().pool.query(sql,values) as Promise<{rows:T[];rowCount:number|null}>;
}
export async function controlTransaction<T>(operation:(client:{query:(sql:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount:number|null}>})=>Promise<T>){
 const client=await databaseDriver().pool.connect();
 try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

// Legacy platform credentials and sessions stay in the control plane.
function placeholders(sql:string){let n=0;return sql.replace(/\?/g,()=>`$${++n}`);}
class ControlStatement{
 constructor(readonly sql:string,readonly values:unknown[]=[]){if(!/^(SELECT|INSERT|DELETE|UPDATE) /i.test(sql.trim()))throw new Error('Invalid control query');}
 bind(...values:unknown[]){return new ControlStatement(this.sql,values);}
 async first<T>(){return (await controlQuery<T>(placeholders(this.sql),this.values)).rows[0]??null;}
 async run(){const r=await controlQuery(placeholders(this.sql),this.values);return {meta:{changes:r.rowCount??0}};}
}
export function platformDb(){return {prepare:(sql:string)=>new ControlStatement(sql.replace(/\b(admin_sessions|admin_passwords|auth_limits)\b/g,'public.$1')),async batch(statements:ControlStatement[]){return controlTransaction(async tx=>{const out=[];for(const s of statements){const r=await tx.query(placeholders(s.sql),s.values);out.push({meta:{changes:r.rowCount??0}});}return out;});}};}
