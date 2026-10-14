import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function hierarchyChecks({m,check,q,query,run,call,operator}){
 const slug='hierarchy-fixture',path='/api/organisation-hierarchy';
 const get=async(cookie=operator)=>(await call(m.hierarchy,'GET',path,null,slug,cookie)).json();
 const post=async(body,cookie=operator)=>call(m.hierarchy,'POST',path,body,slug,cookie);
 let tree,division,other,region,area,district,site,foreign,managerCookie;
 await check('Wizard provisions all six levels atomically and keeps geographic country distinct',async()=>{
  const body={requestId:randomUUID(),name:'Hierarchy Setup',slug:'hierarchy-setup',logo_url:'/branding/eazysafe-logo.png',theme_color:'#123456',administrator:{name:'Setup Admin',email:'admin@hierarchy-setup.invalid'},hierarchy:{labels:['Organisation','Division','Country','Region','Area','Site'],countryLevel:2},sites:[{name:'Dundrum',country:'Ireland',code:'001',groups:['Retail','','East','South']},{name:'London',country:'United Kingdom',code:'002',groups:['Retail','','London','Central']}],departments:[],registration:{self_registration_enabled:false,registration_code:'',employee_id_label:'Employee ID',employee_id_required:false},features:{...m.setupTypes.initialSetupFeatures(),credits:true},creditsPerSite:75};
  const invalid=await call(m.setup,'POST','/api/admin/clients/setup',{...body,sites:[{...body.sites[0],groups:['Retail','France']}]},'primark',operator);assert.equal(invalid.status,400);assert.equal((await q("SELECT id FROM lms_clients WHERE slug='hierarchy-setup'")).length,0);
  const response=await call(m.setup,'POST','/api/admin/clients/setup',body,'primark',operator);assert.equal(response.status,201,await response.clone().text());
  const stores=await run('hierarchy-setup',()=>m.directory.storeDirectory());assert.equal(stores.length,2);assert.deepEqual(stores.find(s=>s.storeCode==='001').unitNames,['Retail','Ireland','East','South']);
  assert.equal((await call(m.setup,'POST','/api/admin/clients/setup',body,'primark',operator)).status,200);assert.equal((await query('hierarchy-setup','SELECT count(*)::int AS n FROM organisation_stores'))[0].n,2);
  const h=await (await call(m.hierarchy,'GET',path,null,'hierarchy-setup',operator)).json(),east=h.units.find(u=>u.name==='East'),uk=h.units.find(u=>u.name==='United Kingdom');
  assert.equal((await call(m.hierarchy,'POST',path,{action:'edit-group',id:east.id,revision:east.revision,name:east.name,code:east.code,parentId:uk.id},'hierarchy-setup',operator)).status,400);
  assert.equal((await query('hierarchy-setup','SELECT balance FROM store_credit_accounts'))[0].balance,75);
 });
 await check('Hierarchy migration preserves Primark and gives clean clients configurable levels',async()=>{
  assert.deepEqual((await query('primark','SELECT labels,primark_locked FROM organisation_hierarchy'))[0],{labels:['Global','Country','Store'],primark_locked:true});
  assert.equal((await query('primark','SELECT count(*)::int AS n FROM organisation_stores s LEFT JOIN organisation_units u ON u.id=s.parent_unit_id WHERE u.id IS NULL OR u.country IS DISTINCT FROM s.country'))[0].n,0);
  assert.equal((await q('SELECT count(*)::int AS n FROM lms_template.organisation_units'))[0].n,0);
  await q("SELECT lms_create_client('Hierarchy Fixture',$1,'/branding/eazysafe-logo.png','#123456','test')",[slug]);
  tree=await get();assert.deepEqual(tree.config.labels,['Organisation','Site']);
  const r=await post({action:'configure',revision:tree.config.revision,labels:['Organisation','Division','Region','Area','District','Site'],countryLevel:null});assert.equal(r.status,200,await r.clone().text());tree=await r.json();
  assert.equal((await call(m.hierarchy,'POST',path,{action:'configure',revision:1,labels:['Changed','Site'],countryLevel:null},'primark',operator)).status,400);
  await assert.rejects(query('primark','SELECT * FROM lms_tenant_2.organisation_units'),/permission denied/);
 });
 const add=async(name,level,parentId=null)=>{const r=await post({action:'add-group',name,code:name.toUpperCase(),level,parentId});assert.equal(r.status,200,await r.clone().text());tree=await r.json();return tree.units.find(u=>u.name===name);};
 await check('Six-level groups enforce acyclic parents, unique codes, revisions and populated levels',async()=>{
  division=await add('Retail',1);other=await add('Wholesale',1);region=await add('East',2,division.id);area=await add('Dublin',3,region.id);district=await add('South',4,area.id);
  assert.equal(district.path.length,4);
  assert.equal(m.hierarchyTypes.reportGrouping(tree,{}),1);assert.equal(m.hierarchyTypes.reportGrouping(tree,{unit:region.id}),3);
  const narrow={...tree,units:tree.units.filter(u=>u.path.includes(area.id))};assert.deepEqual(m.hierarchyTypes.reportLevels(narrow,{}),[3,4,5]);assert.equal(m.hierarchyTypes.reportGrouping(narrow,{groupBy:'1'}),3);
  assert.equal((await post({action:'edit-group',id:division.id,revision:division.revision,name:division.name,code:division.code,parentId:district.id})).status,400);
  assert.equal((await post({action:'configure',revision:tree.config.revision,labels:['Organisation','Site'],countryLevel:null})).status,400);
  assert.equal((await post({action:'edit-group',id:area.id,revision:0,name:area.name,code:area.code,parentId:region.id})).status,409);
 });
 await check('Site imports preview without writes, reject stale previews and preserve codes and paths',async()=>{
  assert.deepEqual(m.siteCsv.parseSiteCsv('name,country,store_code,group_2\n"Dundrum, South",Ireland,001,East')[0],{name:'Dundrum, South',country:'Ireland',code:'001',groups:['','East']});
  const rows=[{name:'Dundrum',country:'Ireland',code:'001',groups:['Retail','East','Dublin','South']},{name:'Depot',country:'Ireland',code:'002',groups:['Wholesale']}];
  const preview=await call(m.siteImport,'POST','/api/admin/organisation/import',{action:'preview',rows},slug,operator);assert.equal(preview.status,200,await preview.clone().text());const p=await preview.json();
  assert.equal((await query(slug,'SELECT count(*)::int AS n FROM organisation_stores'))[0].n,0);
  assert.equal((await call(m.siteImport,'POST','/api/admin/organisation/import',{action:'commit',rows,revision:'stale'},slug,operator)).status,409);
  const committed=await call(m.siteImport,'POST','/api/admin/organisation/import',{action:'commit',rows,revision:p.revision},slug,operator);assert.equal(committed.status,200,await committed.clone().text());assert.equal((await committed.json()).created,2);
  const stores=await run(slug,()=>m.directory.storeDirectory());site=stores.find(s=>s.storeCode==='001');foreign=stores.find(s=>s.storeCode==='002');assert.deepEqual(site.unitPath,district.path);assert.equal(site.country,'Ireland');
  assert.equal((await call(m.siteImport,'POST','/api/admin/organisation/import',{action:'commit',rows,revision:p.revision},slug,operator)).status,400);
  assert.equal((await post({action:'delete-group',id:district.id,revision:district.revision})).status,400);
 });
 await check('Branch grants filter users and reports, deduplicate overlapping roots and reject escalation',async()=>{
  await query(slug,"INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('group-manager','Group Manager','group@test.invalid','none','','',now()::text)");
  await query(slug,"INSERT INTO reporting_access(learner_id,scope,assigned_by,updated_at,unit_ids) VALUES('group-manager','unit','test',now()::text,?::text[])",[division.id,region.id]);
  await query(slug,"INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES(?,'group-manager','2099-01-01')",await m.hash('hierarchy-session'));managerCookie='primark_session=hierarchy-session';
  for(let i=0;i<35;i++)await query(slug,"INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at,induction_enrolled) VALUES(?,?,?,'none',?,'Ireland',now()::text,false)",'learner-'+i,'Learner '+String(i).padStart(2,'0'),'learner'+i+'@test.invalid',i<30?site.id:foreign.id);
  const groupData=await (await call(m.users,'GET','/api/users',null,slug,managerCookie)).json();assert.equal(groupData.total,31);assert.equal(groupData.people.length,25);assert.equal(groupData.stores.length,1);
  assert.equal((await call(m.users,'POST','/api/users',{accountType:'admin',name:'Bad Grant',email:'bad@test.invalid',password:'Long-enough-test-password',role:'unit',unitIds:[other.id]},slug,managerCookie)).status,403);
  for(const params of ['role=global','role=site&site='+foreign.id])assert.equal((await call(m.reports,'GET','/api/reporting?'+params,null,slug,managerCookie)).status,403);
  assert.equal((await call(m.organisation,'POST','/api/admin/organisation',{action:'archive',id:foreign.id},slug,managerCookie)).status,403);
  const own=await call(m.organisation,'GET','/api/admin/organisation',null,slug,managerCookie);assert.equal(own.status,200);assert.equal((await own.json()).stores.length,1);
  await assert.rejects(query(slug,"INSERT INTO reporting_access(learner_id,scope,assigned_by,updated_at,unit_ids) VALUES('learner-34','unit','test',now()::text,ARRAY['missing'])"),/valid unique/);
 });
 await check('Group administrators can create and revise narrower grants but cannot move them outside their scope',async()=>{
  const created=await call(m.users,'POST','/api/users',{accountType:'admin',name:'Child Manager',email:'child@test.invalid',password:'Long-enough-test-password',role:'unit',unitIds:[region.id]},slug,managerCookie);assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();
  const person=async()=>{const r=await (await call(m.users,'GET','/api/users?search=child@test.invalid',null,slug,managerCookie)).json();assert.equal(r.total,1);return r.people[0];};
  let child=await person();assert.deepEqual(child.reporting_unit_ids,[region.id]);
  const changed=await call(m.users,'PATCH','/api/users',{action:'access',id,revision:child.revision,role:'unit',unitIds:[area.id]},slug,managerCookie);assert.equal(changed.status,200,await changed.clone().text());
  child=await person();assert.deepEqual(child.reporting_unit_ids,[area.id]);
  const rejected=await call(m.users,'PATCH','/api/users',{action:'access',id,revision:child.revision,role:'unit',unitIds:[other.id]},slug,managerCookie);assert.equal(rejected.status,403);assert.deepEqual((await query(slug,'SELECT unit_ids FROM reporting_access WHERE learner_id=?',id))[0].unit_ids,[area.id]);
 });
 await check('Group course audiences use existing assignments, reach future starters and aggregate without learner payloads',async()=>{
  const audience=JSON.stringify({countries:[],sites:[],users:[],units:[division.id,region.id]});
  await query(slug,"INSERT INTO courses(id,title,description,status,audience_json,created_at,updated_at,catalogue_scope,induction_role) VALUES('hierarchy-course','Hierarchy course','','draft',?,now()::text,now()::text,'global','none')",audience);
  const saved=await call(m.adminCourses,'POST','/api/admin/courses',{id:'hierarchy-course',revision:1,title:'Hierarchy course',description:'',status:'draft',audience:JSON.parse(audience)},slug,operator);assert.equal(saved.status,200,await saved.clone().text());
  await query(slug,"INSERT INTO course_packages(id,course_id,filename,status,scos_json,created_at,file_count,total_bytes) VALUES('hierarchy-package','hierarchy-course','fixture.zip','ready',?,now()::text,1,1)",JSON.stringify([{id:'sco',title:'Lesson',href:'index.html'}]));
  await query(slug,"UPDATE courses SET package_id='hierarchy-package',status='published' WHERE id='hierarchy-course'");
  await query(slug,'SELECT sync_credit_assignments(NULL,false)');
  assert.equal((await query(slug,'SELECT count(*)::int AS n FROM course_assignments'))[0].n,30);
  const r=await call(m.reports,'GET','/api/reporting?role=unit&course=hierarchy-course&unit='+division.id,null,slug,managerCookie);assert.equal(r.status,200,await r.clone().text());const overview=await r.json();assert.equal(overview.metrics.assigned,30);assert.equal(overview.employees,undefined);assert.equal(overview.records,undefined);assert.equal(overview.groups.length,1);
  const activity=await (await call(m.reports,'GET','/api/reporting?role=site&site='+site.id+'&view=activity&course=hierarchy-course&completion=not-completed',null,slug,managerCookie)).json();assert.equal(activity.pageSize,25);assert.equal(activity.employees.length,25);assert.equal(activity.hasMore,true);
  const exportResponse=await call(m.reports,'GET','/api/reporting?role=unit&unit='+division.id+'&view=export',null,slug,managerCookie);assert.equal(exportResponse.status,200);assert.equal((await exportResponse.json()).employees.length,30);
  await query(slug,"INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at,induction_enrolled) VALUES('future-starter','Future starter','future@test.invalid','none',?,'Ireland',now()::text,false)",site.id);
  await query(slug,"SELECT sync_credit_assignments('future-starter',false)");assert.equal((await query(slug,'SELECT count(*)::int AS n FROM course_assignments'))[0].n,31);
 });
 await check('Moving a branch updates scope immediately while preserving stores, assignments and dated audit history',async()=>{
  const r=await post({action:'edit-group',id:region.id,revision:region.revision,name:region.name,code:region.code,parentId:other.id});assert.equal(r.status,200,await r.clone().text());
  // Remove the independent overlapping grant so Retail loses the moved subtree.
  await query(slug,"UPDATE reporting_access SET unit_ids=?::text[] WHERE learner_id='group-manager'",[division.id]);
  const moved=(await run(slug,()=>m.directory.storeDirectory())).find(s=>s.id===site.id);assert.equal(moved.id,site.id);assert(!moved.unitPath.includes(division.id));assert(moved.unitPath.includes(other.id));
  assert.equal((await call(m.reports,'GET','/api/reporting?role=site&site='+site.id,null,slug,managerCookie)).status,403);
  assert.equal((await query(slug,'SELECT count(*)::int AS n FROM course_assignments'))[0].n,31);
  const audits=await query(slug,"SELECT previous_state,next_state,recorded_at FROM audit_events WHERE entity='organisation_units' AND entity_id=? AND action='update'",region.id);assert.equal(audits.at(-1).previous_state.parent_id,division.id);assert.equal(audits.at(-1).next_state.parent_id,other.id);assert(audits.at(-1).recorded_at);
 });
}
