import {db,inTransaction} from './database';
import {CourseError} from './course-admin';
import {type UserAdministrator} from './user-administration';
import {unitInAccess,type HierarchyConfig,type OrganisationHierarchy,type OrganisationUnit} from './hierarchy-types';
import type {ReportingAccess} from './reporting-types';
export const unitTreeSql=`WITH RECURSIVE tree AS (
 SELECT u.*,ARRAY[u.id] AS path,ARRAY[u.name] AS path_names FROM organisation_units u WHERE parent_id IS NULL
 UNION ALL SELECT u.*,t.path||u.id,t.path_names||u.name FROM organisation_units u JOIN tree t ON t.id=u.parent_id
) SELECT id,name,code,level,parent_id AS "parentId",country,revision,path,path_names AS "pathNames" FROM tree`;
export async function organisationHierarchy():Promise<OrganisationHierarchy>{
 const config=await db().prepare('SELECT labels,country_level AS "countryLevel",revision,primark_locked AS "primarkLocked" FROM organisation_hierarchy WHERE id=1').first<HierarchyConfig>();
 if(!config)throw new CourseError('Organisation structure is unavailable.',503);
 const {results:units}=await db().prepare(unitTreeSql+' ORDER BY path_names,id').all<OrganisationUnit>();
 return {config,units};
}
export function visibleHierarchy(hierarchy:OrganisationHierarchy,access:ReportingAccess){return {...hierarchy,units:hierarchy.units.filter(u=>unitInAccess(access,u,hierarchy.units))};}
export function validateHierarchy(value:unknown){
 const h=value as {labels?:unknown;countryLevel?:unknown}|undefined;
 if(!h||!Array.isArray(h.labels)||h.labels.length<2||h.labels.length>6||h.labels.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>40))throw new CourseError('Choose between two and six named levels.');
 const labels=h.labels.map(v=>(v as string).trim());
 if(new Set(labels.map(v=>v.toLowerCase())).size!==labels.length)throw new CourseError('Use a different name for each level.');
 const countryLevel=h.countryLevel??null;
 if(countryLevel!==null&&(!Number.isInteger(countryLevel)||Number(countryLevel)<1||Number(countryLevel)>=labels.length-1))throw new CourseError('Choose a valid country level.');
 return {labels,countryLevel:countryLevel as number|null};
}
export async function validateUnitGrant(actor:UserAdministrator,value:unknown){
 if(!Array.isArray(value)||!value.length||value.length>100||value.some(id=>typeof id!=='string')||new Set(value).size!==value.length)throw new CourseError('Choose one or more organisation groups.');
 const h=await organisationHierarchy();
 const units=value.map(id=>h.units.find(u=>u.id===id));
 if(units.some(u=>!u||!unitInAccess(actor.access,u,h.units)))throw new CourseError('You can manage accounts only within your assigned scope.',403);
 return value as string[];
}
export async function refreshHierarchyActor(tx:Parameters<Parameters<typeof inTransaction>[0]>[0],actor:UserAdministrator):Promise<UserAdministrator>{
 if(!actor.id)return actor;
 const row=(await tx.query(`SELECT l.email,l.archived_at,r.scope,r.country,r.site_id,r.unit_ids,m.store_id AS manager_store_id,s.country AS manager_country,
 EXISTS(SELECT 1 FROM platform_admins p WHERE p.learner_id=l.id) AS platform_admin
 FROM learners l LEFT JOIN reporting_access r ON r.learner_id=l.id LEFT JOIN store_managers m ON m.learner_id=l.id LEFT JOIN organisation_stores s ON s.id=m.store_id WHERE l.id=$1 FOR UPDATE OF l`,[actor.id])).rows[0];
 if(!row||row.archived_at||(!row.platform_admin&&!row.scope&&!row.manager_store_id))throw new CourseError('Reporting access is required.',403);
 return {...actor,email:String(row.email),platformAdmin:!!row.platform_admin,managerStoreId:row.manager_store_id as string|null,access:row.platform_admin?{scope:'organisation',country:null,siteId:null}:row.scope?{scope:row.scope as ReportingAccess['scope'],country:row.country as string|null,siteId:row.site_id as string|null,unitIds:row.unit_ids as string[]}:{scope:'site',country:row.manager_country as string|null,siteId:row.manager_store_id as string}};
}
export async function changeHierarchy(actor:UserAdministrator,b:Record<string,unknown>){
 return inTransaction(async tx=>{
  // All hierarchy and site mutations use this same row lock.
  await tx.query('SELECT id FROM organisation_hierarchy WHERE id=1 FOR UPDATE');
  const current=await refreshHierarchyActor(tx,actor);
  if(current.email!==actor.email||!['organisation','country','unit'].includes(current.access.scope))throw new CourseError('Reporting access is required.',403);
  const h=await organisationHierarchy(),unit=h.units.find(u=>u.id===b.id);
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
  if(b.action==='configure'){
   if(current.access.scope!=='organisation')throw new CourseError('Organisation admin access is required.',403);
   if(h.config.primarkLocked)throw new CourseError('Primark keeps Global > Country > Store.');
   if(b.revision!==h.config.revision)throw new CourseError('The organisation structure changed. Refresh and try again.',409);
   const next=validateHierarchy(b);
   if(h.units.some(u=>u.level>=next.labels.length-1)||next.countryLevel!==h.config.countryLevel&&h.units.length)throw new CourseError('Move or remove groups before changing their levels.');
   await tx.query('UPDATE organisation_hierarchy SET labels=$1,country_level=$2,revision=revision+1 WHERE id=1',[next.labels,next.countryLevel]);
  }else{
   if(!['add-group','edit-group','delete-group'].includes(String(b.action)))throw new CourseError('Invalid request.');
   if(b.action!=='add-group'&&(!unit||!unitInAccess(current.access,unit,h.units)))throw new CourseError('Choose a group within your scope.',403);
   if(unit&&b.revision!==unit.revision)throw new CourseError('The organisation structure changed. Refresh and try again.',409);
   if(b.action==='delete-group'){
    if((await tx.query("SELECT id FROM courses WHERE jsonb_exists(audience_json::jsonb->'units',$1) LIMIT 1",[unit!.id])).rows.length||h.units.some(u=>u.parentId===unit!.id)||(await tx.query('SELECT id FROM organisation_stores WHERE parent_unit_id=$1 LIMIT 1',[unit!.id])).rows.length||(await tx.query('SELECT learner_id FROM reporting_access WHERE $1=ANY(unit_ids) LIMIT 1',[unit!.id])).rows.length)throw new CourseError('Move child groups, stores and access grants before deleting this group.');
    await tx.query('DELETE FROM organisation_units WHERE id=$1',[unit!.id]);
   }else{
    const name=typeof b.name==='string'?b.name.trim():'',code=typeof b.code==='string'?b.code.trim():'';
    const level=unit?.level??Number(b.level),parentId=typeof b.parentId==='string'&&b.parentId?b.parentId:null,parent=h.units.find(u=>u.id===parentId);
    if(!name||name.length>100||!code||!/^[a-zA-Z0-9._-]{1,80}$/.test(code)||!Number.isInteger(level)||level<1||level>=h.config.labels.length-1)throw new CourseError('Check the group name, code and level.');
    if(parentId&&(!parent||parent.level>=level)||parent?.path.includes(unit?.id||'!'))throw new CourseError('Choose a parent from an earlier level.');
    if(current.access.scope!=='organisation'&&(!parent||!unitInAccess(current.access,parent,h.units)))throw new CourseError('Choose a group within your scope.',403);
    if(unit&&parent){const country=h.units.find(u=>parent.path.includes(u.id)&&u.country)?.country;if(country&&(await tx.query('SELECT id FROM organisation_stores WHERE parent_unit_id=ANY(hierarchy_descendants($1::text[])) AND country<>$2 LIMIT 1',[[unit.id],country])).rows.length)throw new CourseError('Store country must match its country group.');}
    if(unit&&unit.country&&name!==unit.name)throw new CourseError('Create a new country group to change country.');
    if(unit)await tx.query('UPDATE organisation_units SET name=$2,code=$3,parent_id=$4,revision=revision+1 WHERE id=$1',[unit.id,name,code,parentId]);
    else await tx.query('INSERT INTO organisation_units(id,name,code,level,parent_id,country) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),name,code,level,parentId,level===h.config.countryLevel?name:null]);
   }
  }
  return visibleHierarchy(await organisationHierarchy(),current.access);
 });
}
