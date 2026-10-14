import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function clientEditChecks({m,check,q,query,run,call,req,operator,primaryCookie}){
 let id,initial;
 const path=()=>'/api/admin/clients/settings?id='+id;
 const read=async()=>{const r=await call(m.clientEdit,'GET',path(),null,'primark',operator);assert.equal(r.status,200,await r.clone().text());return r.json()};
 const save=(body,cookie=operator)=>call(m.clientEdit,'PATCH',path(),body,'primark',cookie);
 await check('Client settings require a global operator and reject cross-origin writes',async()=>{
  const input={requestId:randomUUID(),name:'Edit Fixture',slug:'edit-fixture',logo_url:'/branding/eazysafe-logo.png',theme_color:'#7944c8',administrator:{name:'Edit Admin',email:'admin@edit.invalid'},sites:[{name:'Dublin',country:'Ireland',code:'ED-DUB'}],departments:['Operations'],registration:{self_registration_enabled:false,registration_code:'edit-join',employee_id_label:'Staff ID',employee_id_required:false},features:{...m.setupTypes.initialSetupFeatures(),credits:true},creditsPerSite:75};
  const created=await call(m.setup,'POST','/api/admin/clients/setup',input,'primark',operator);assert.equal(created.status,201,await created.clone().text());id=(await created.json()).id;initial=await read();
  for(const cookie of ['',primaryCookie]){assert.equal((await call(m.clientEdit,'GET',path(),null,'primark',cookie)).status,403);assert.equal((await save(initial,cookie)).status,403)}
  const request=req(path(),'PATCH',initial,operator);request.headers.set('origin','https://foreign.invalid');assert.equal((await run('primark',()=>m.clientEdit.PATCH(request),operator)).status,403);
  const legacy=await call(m.clientEdit,'GET','/api/admin/clients/settings?id=2',null,'primark',operator);assert.equal(legacy.status,200,'Clients created before the wizard must also be editable');
 });
 await check('Editing is atomic, client-scoped and preserves accounts, identifiers and credit history',async()=>{
  const other=await query('primark','SELECT * FROM registration_settings'),people=await query('edit-fixture','SELECT * FROM learners'),credits=await query('edit-fixture','SELECT store_id,balance,target FROM store_credit_accounts'),ledger=await query('edit-fixture','SELECT * FROM credit_ledger');
  const body=structuredClone(initial);body.client.name='Edited Client';body.client.theme_color='#123456';body.sites[0].name='Dublin Central';body.sites.push({id:'',name:'Cork',country:'Ireland',code:'ED-ORK',active:true});body.departments[0].name='Operations Team';body.departments.push({id:'',name:'Finance',archived:false});body.registration.employee_id_label='Payroll number';body.choices.live_training={policy:'required',enabled:false};
  const r=await save(body);assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('set-cookie'),null);const next=await read();assert.equal(next.client.name,'Edited Client');assert.equal(next.client.slug,initial.client.slug);assert.equal(next.sites.length,2);assert.equal(next.sites.find(s=>s.id===initial.sites[0].id).name,'Dublin Central');assert.equal(next.departments.find(d=>d.id===initial.departments[0].id).name,'Operations Team');assert.equal(next.registration.employee_id_label,'Payroll number');assert.equal(next.choices.live_training.policy,'required');
  assert.deepEqual(await query('primark','SELECT * FROM registration_settings'),other);assert.deepEqual(await query('edit-fixture','SELECT * FROM learners'),people);assert.deepEqual(await query('edit-fixture','SELECT store_id,balance,target FROM store_credit_accounts WHERE store_id=?',credits[0].store_id),credits);assert.deepEqual(await query('edit-fixture','SELECT * FROM credit_ledger WHERE store_id=?',credits[0].store_id),ledger);
  assert.equal((await query('edit-fixture','SELECT feature_enabled(\'live_training\') AS enabled'))[0].enabled,true);
  assert(!(JSON.stringify(await query('edit-fixture','SELECT * FROM audit_events'))).includes('edit-join'));
  const again=await save(body);assert.equal(again.status,409,'A stale editor cannot overwrite changes');assert.equal((await read()).client.revision,next.client.revision);
 });
 await check('Foreign IDs, missing records, portal changes and country transfers cannot bypass client boundaries',async()=>{
  const current=await read();
  for(const mutate of [b=>{b.sites[0].id='foreign-site'},b=>{b.sites.pop()},b=>{b.departments[0].id='foreign-department'},b=>{b.client.slug='primark'},b=>{b.sites[0].country='United Kingdom'},b=>{b.choices.pathway_certificates={policy:'required',enabled:true};b.choices.pathways={policy:'disabled',enabled:false}}]){
   const body=structuredClone(current);body.client.name='Must not save';mutate(body);const r=await save(body);assert([400,409].includes(r.status),await r.clone().text());assert.equal((await read()).client.name,current.client.name);
  }
 });
 await check('Concurrent client settings updates reject the whole edit including branding',async()=>{
  for(const sql of ["UPDATE registration_settings SET revision=revision+1", "UPDATE organisation_settings SET revision=revision+1", "UPDATE organisation_departments SET name=name||' Updated'", "UPDATE organisation_stores SET updated_at='2026-10-12T15:00:00.123Z'"]){
   const stale=await read();await query('edit-fixture',sql);stale.client.name='Stale overwrite';const r=await save(stale);assert.equal(r.status,409,await r.clone().text());assert.notEqual((await read()).client.name,'Stale overwrite');
  }
 });
 await check('Database failures roll back registry branding, site edits, settings and audit together',async()=>{
  const current=await read(),audit=await q('SELECT * FROM public.lms_client_audit WHERE client_id=$1',[id]);
  await q(`CREATE FUNCTION lms_tenant_${id}.edit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'edit fixture failure'; END $$`);
  await q(`CREATE TRIGGER edit_failure BEFORE UPDATE ON lms_tenant_${id}.organisation_settings FOR EACH ROW EXECUTE FUNCTION lms_tenant_${id}.edit_failure()`);
  const body=structuredClone(current);body.client.name='Must roll back';body.client.default_language='ar';body.client.location_term='store';body.sites[0].name='Must roll back site';const r=await save(body);assert.equal(r.status,503,await r.clone().text());
  await q(`DROP TRIGGER edit_failure ON lms_tenant_${id}.organisation_settings`);await q(`DROP FUNCTION lms_tenant_${id}.edit_failure()`);
  assert.deepEqual(await read(),current);assert.deepEqual(await q('SELECT * FROM public.lms_client_audit WHERE client_id=$1',[id]),audit);
  assert.equal((await query('primark','SELECT current_user AS role'))[0].role,'lms_client_1');
 });
 await check('Client preferences validate, persist, preserve other clients and participate in stale-save protection',async()=>{
  const legacy=(await q('SELECT default_language,location_term FROM public.lms_clients WHERE id=1'))[0];
  assert.deepEqual(legacy,{default_language:'en',location_term:null});
  const body=await read();body.client.default_language='fr';body.client.location_term='store';
  assert.equal((await save(body)).status,200);
  const next=await read();assert.equal(next.client.default_language,'fr');assert.equal(next.client.location_term,'store');
  assert.deepEqual((await q('SELECT default_language,location_term FROM public.lms_clients WHERE id=1'))[0],legacy);
  assert.equal((await save(body)).status,409);
  for(const patch of [{default_language:'xx'},{default_language:null},{location_term:'branch'},{location_term:[]}]){
   const invalid=structuredClone(next);Object.assign(invalid.client,patch);assert.equal((await save(invalid)).status,400);assert.deepEqual(await read(),next);
  }
  const older=structuredClone(next);delete older.client.default_language;delete older.client.location_term;
  assert.equal((await save(older)).status,200);assert.equal((await read()).client.default_language,'fr');assert.equal((await read()).client.location_term,'store');
 });
 await check('Archive/restore retains linked records and unchanged required feature policies',async()=>{
  const current=await read(),people=await query('edit-fixture','SELECT * FROM learners'),body=structuredClone(current);body.sites[0].active=false;body.departments[0].archived=true;const r=await save(body);assert.equal(r.status,200,await r.clone().text());const next=await read();assert.equal(next.sites[0].active,false);assert.equal(next.departments[0].archived,true);assert.equal(next.choices.live_training.policy,'required');assert.deepEqual(await query('edit-fixture','SELECT * FROM learners'),people);
 });
 await check('Login photo rejects unsafe images, persists within its client and can be removed',async()=>{
  const sharp=(await import('sharp')).default;
  const image='data:image/png;base64,'+(await sharp({create:{width:40,height:30,channels:3,background:'#0088aa'}}).png().toBuffer()).toString('base64');
  const other=(await q('SELECT login_background FROM lms_clients WHERE id=1'))[0];
  for(const value of ['https://example.invalid/photo.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YmFk',image+'x'.repeat(500000)]){
   const body=await read();body.client.login_background=value;assert.equal((await save(body)).status,400);
  }
  const body=await read();body.client.login_background=image;assert.equal((await save(body)).status,200);
  const next=await read();assert.match(next.client.login_background,/^data:image\/jpeg;base64,/);
  assert.deepEqual((await q('SELECT login_background FROM lms_clients WHERE id=1'))[0],other);
  next.client.login_background=null;assert.equal((await save(next)).status,200);assert.equal((await read()).client.login_background,null);
 });

}
