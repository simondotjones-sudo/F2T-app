import assert from 'node:assert/strict';
export async function helpChecks({m,check,q,query,run,call,req,operator,primaryCookie,internalCookie}){
 let id,article;
 const request=async(body,cookie=primaryCookie,client='primark')=>call(m.help,'POST','/api/help',body,client,cookie);
 await check('Help role and feature filtering covers learner, manager, organisation and global operator',async()=>{
  const features={client_course_management:true,course_authoring:true,course_feedback:true};
  assert(m.helpContent.visibleHelp(m.helpContent.helpArticles,'learner',features).every(a=>['start','learning','records'].includes(a.category)));
  assert(!m.helpContent.visibleHelp(m.helpContent.helpArticles,'organisation',{}).some(a=>a.category==='author'));
  assert(!m.helpContent.visibleHelp(m.helpContent.helpArticles,'platform',features,false).some(a=>a.category==='platform'));
  assert(m.helpContent.visibleHelp(m.helpContent.helpArticles,'platform',features,true).some(a=>a.id==='clients'));
  assert(!m.helpContent.visibleHelp(m.helpContent.helpArticles,'manager',{}).some(a=>a.id==='live'));
  assert.equal((await call(m.help,'GET','/api/help')).status,401);
  assert.equal((await call(m.help,'GET','/api/help?inbox=1',undefined,'primark',primaryCookie)).status,403);
 });
 await check('Help contact persists once, validates attachments and prevents unauthorised changes',async()=>{
  id=crypto.randomUUID();const sharp=(await import('sharp')).default;
  const screenshot='data:image/png;base64,'+(await sharp({create:{width:30,height:20,channels:3,background:'#ffffff'}}).png().toBuffer()).toString('base64');
  const body={action:'request',id,subject:'Fictional help test',message:'Example request',topic:'start',screenshot};
  assert.equal((await request(body)).status,200);assert.equal((await request(body)).status,200);
  assert.equal((await query('primark','SELECT * FROM help_requests WHERE id=?',id)).length,1);
  assert.equal((await query('primark','SELECT notification FROM help_requests WHERE id=?',id))[0].notification,'not_sent');
  assert.equal((await request({...body,id:crypto.randomUUID(),screenshot:'data:image/png;base64,AAAA'})).status,400);
  assert.equal((await request({...body,id:crypto.randomUUID(),topic:'platform'})).status,400);
  assert.equal((await request({action:'status',id,status:'resolved',reply:'bad',revision:1})).status,403);
  const foreign=req('/api/help','POST',body,primaryCookie);foreign.headers.set('origin','https://other.invalid');assert.equal((await run('primark',()=>m.help.POST(foreign),primaryCookie)).status,403);
  const data=await (await call(m.help,'GET','/api/help',undefined,'primark',primaryCookie)).json();assert(data.requests.some(r=>r.id===id));assert(!JSON.stringify(data).includes('data:image'));assert.equal(data.settings,null);
 });
 await check('Help requests, screenshots and editorial overrides stay inside their client',async()=>{
  const file=(client,cookie)=>run(client,()=>m.helpFile.GET(req('/api/help/screenshot/'+id,'GET',undefined,cookie),{params:Promise.resolve({id})}),cookie);
  assert.equal((await file('primark',primaryCookie)).status,200);
  assert([401,404].includes((await file('eazysafe-internal',internalCookie)).status));
  assert.equal((await file('eazysafe-internal',operator)).status,404);
  const data=await (await call(m.help,'GET','/api/help?inbox=1',undefined,'eazysafe-internal',operator)).json();assert(!data.requests.some(r=>r.id===id));
  await assert.rejects(query('eazysafe-internal','SELECT * FROM public.help_requests'),/permission denied/);
  const admin=await (await call(m.help,'GET','/api/help',undefined,'primark',operator)).json();article=admin.articles.find(a=>a.id==='sign-in');
  assert.equal((await request({action:'article',...article,title:'Updated fictional article'},primaryCookie)).status,403);
  assert.equal((await request({action:'article',...article,title:'Updated fictional article'},operator)).status,200);
  assert.equal((await request({action:'article',...article,title:'Stale update'},operator)).status,409);
  const own=await (await call(m.help,'GET','/api/help',undefined,'primark',primaryCookie)).json();assert.equal(own.articles.find(a=>a.id==='sign-in').title,'Updated fictional article');
  assert.notEqual(data.articles.find(a=>a.id==='sign-in').title,'Updated fictional article');
 });
 await check('Help replies, routing and rate limits preserve audit and reject stale writes',async()=>{
  assert.equal((await request({action:'status',id,status:'resolved',reply:'Fictional response',revision:1},operator)).status,200);
  assert.equal((await request({action:'status',id,status:'open',reply:'stale',revision:1},operator)).status,409);
  const own=await (await call(m.help,'GET','/api/help',undefined,'primark',primaryCookie)).json();assert.equal(own.requests.find(r=>r.id===id).reply,'Fictional response');
  assert.equal((await request({action:'settings',email:'support@example.invalid',revision:1},operator)).status,200);
  assert.equal((await request({action:'settings',email:'other@example.invalid',revision:1},operator)).status,409);
  for(let i=0;i<4;i++)assert.equal((await request({action:'request',id:crypto.randomUUID(),subject:'Rate test',message:'Fictional',topic:'other'})).status,200);
  assert.equal((await request({action:'request',id:crypto.randomUUID(),subject:'Rate test',message:'Fictional',topic:'other'})).status,429);
  assert((await query('primark',"SELECT * FROM audit_events WHERE entity='help_requests' AND entity_id=?",id)).length>=2);
 });
 await check('New clients inherit clean Help settings without articles or tickets and cannot delete support records',async()=>{
  const rows=await q("SELECT public.lms_create_client('Help fixture','help-fixture','/branding/eazysafe-logo.png','#e8002a','fixture') AS id");
  const schema='lms_tenant_'+rows[0].id;
  assert.equal((await q(`SELECT support_email FROM ${schema}.help_settings`))[0].support_email,'');
  assert.equal((await q(`SELECT count(*)::int AS n FROM ${schema}.help_requests`))[0].n,0);
  assert.equal((await q(`SELECT count(*)::int AS n FROM ${schema}.help_articles`))[0].n,0);
  await assert.rejects(query('help-fixture','DELETE FROM help_requests'),/permission denied/);
 });
}
