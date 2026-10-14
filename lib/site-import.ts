import {createHash} from 'node:crypto';
import {CourseError} from './course-admin';
import {inTransaction} from './database';
import {organisationHierarchy,refreshHierarchyActor} from './organisation-hierarchy';
import {storeDirectory} from './store-directory';
import {type UserAdministrator} from './user-administration';
export type SiteImportRow={name:string;country:string;code:string;groups:string[]};
export async function importSites(body:Record<string,unknown>,original:UserAdministrator){
 return inTransaction(async tx=>{
  await tx.query('SELECT id FROM organisation_hierarchy WHERE id=1 FOR UPDATE');
  const actor=await refreshHierarchyActor(tx,original);
  if(actor.access.scope!=='organisation')throw new CourseError('Organisation admin access is required.',403);
  const hierarchy=await organisationHierarchy(),stores=await storeDirectory();
  if(!['preview','commit'].includes(String(body.action))||!Array.isArray(body.rows)||!body.rows.length||body.rows.length>200)throw new CourseError('Upload between 1 and 200 sites.');
  const seen=new Set<string>(),seenNames=new Set<string>();
  const rows:SiteImportRow[]=body.rows.map((value:unknown)=>{
   const r=value as SiteImportRow;
   if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.trim().length>150||typeof r.country!=='string'||r.country.trim().length<2||r.country.trim().length>80||typeof r.code!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(r.code.trim())||!Array.isArray(r.groups)||r.groups.length>hierarchy.config.labels.length-2||r.groups.some(g=>typeof g!=='string'||g.trim().length>100))throw new CourseError('Check site names, countries and unique site codes.');
   const row={name:r.name.trim(),country:r.country.trim(),code:r.code.trim().toUpperCase(),groups:r.groups.map(g=>g.trim())};
   const key=(row.country+'\n'+row.name).toLowerCase();
   if(seen.has(row.code)||seenNames.has(key)||stores.some(s=>(s.storeCode||'').toUpperCase()===row.code))throw new CourseError('This site code already exists. Use Edit to move an existing site.');
   const countryLevel=hierarchy.config.countryLevel;
   if(countryLevel){if(row.groups[countryLevel-1]&&row.groups[countryLevel-1]!==row.country)throw new CourseError('Store country must match its country group.');while(row.groups.length<countryLevel)row.groups.push('');row.groups[countryLevel-1]=row.country;}
   seen.add(row.code);seenNames.add(key);return row;
  });
  const revision=createHash('sha256').update(JSON.stringify([hierarchy,stores.map(s=>[s.id,s.storeCode,s.name,s.country,s.parentUnitId]),rows])).digest('hex');
  if(body.action==='preview')return {rows,revision,created:0};
  if(body.revision!==revision)throw new CourseError('The organisation structure changed. Preview the import again.',409);
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
  for(const row of rows){
   const id=crypto.randomUUID();
   await tx.query('INSERT INTO organisation_stores(id,name,country,store_code,active,updated_by,updated_at,parent_unit_id) VALUES($1,$2,$3,$4,true,$5,now()::text,hierarchy_ensure_path($6,$3))',[id,row.name,row.country,row.code,actor.email,row.groups]);
   await tx.query('SELECT ensure_store_credits($1,$2,$3,$4)',[id,row.name,row.country,row.code]);
  }
  return {created:rows.length,revision,rows};
 });
}
