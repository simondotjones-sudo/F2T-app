
import {db} from '@/lib/database';
import {activeLearnerSql} from '@/lib/account-type';
export type DirectoryStore = {id:string;name:string;country:string;active:boolean;storeCode?:string|null;address?:string|null;adminEmail?:string|null;learnerCount?:number;revision?:string|null;canDelete?:boolean;parentUnitId?:string|null;unitPath?:string[];unitNames?:string[]};
export async function storeDirectory(includeArchived=true,includeAdmin=false):Promise<DirectoryStore[]> {
  const overrides=(await db().prepare(`WITH RECURSIVE tree AS (SELECT id,parent_id,ARRAY[id] AS path,ARRAY[name] AS names FROM organisation_units WHERE parent_id IS NULL
 UNION ALL SELECT u.id,u.parent_id,t.path||u.id,t.names||u.name FROM organisation_units u JOIN tree t ON t.id=u.parent_id)
 SELECT s.parent_unit_id AS "parentUnitId",COALESCE(t.path,ARRAY[]::text[]) AS "unitPath",COALESCE(t.names,ARRAY[]::text[]) AS "unitNames",s.id,s.name,s.country,s.active,s.deleted_at AS "deletedAt",s.store_code AS "storeCode",s.address,${includeAdmin?'COALESCE(s.admin_email,l.email)':'NULL::text'} AS "adminEmail"${includeAdmin?`,s.updated_at AS revision,CASE WHEN NOT s.active AND s.deleted_at IS NULL THEN store_can_delete(s.id) ELSE false END AS "canDelete",(SELECT COUNT(*)::int FROM learners p WHERE p.store_id=s.id AND ${activeLearnerSql('p')}) AS "learnerCount"`:''} FROM organisation_stores s LEFT JOIN tree t ON t.id=s.parent_unit_id LEFT JOIN learners l ON l.id=s.admin_learner_id`).all<DirectoryStore & {deletedAt:string|null}>()).results;
  const entries=new Map<string,DirectoryStore>();
  for(const {deletedAt,...store} of overrides){if(deletedAt)entries.delete(store.id);else entries.set(store.id,store);}
  return [...entries.values()].filter(s=>includeArchived||s.active).sort((a,b)=>a.country.localeCompare(b.country)||a.name.localeCompare(b.name)||(a.storeCode||'').localeCompare(b.storeCode||''));
}
