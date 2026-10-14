import {cookies} from 'next/headers';
import type {NextRequest} from 'next/server';
import {getAdminUser,credentials} from './admin-auth';
import {learnerForSession} from './server';
import {reportingAccessFor} from './reporting-access';
import {db,inTransaction} from './database';
import {bodyJson,CourseError} from './course-admin';
import {sameOrigin} from './request-origin';
import {featureChoices,featureEnabled} from './features';
import {featureCatalogue,effectiveFeature} from './feature-catalogue';
import {helpArticles,helpCategories,visibleHelp,type HelpArticle,type HelpRole} from './help-content';
import {normaliseImage} from './image-validation';
import {currentTenant} from './tenant-context';
import {deliverLearningEmail} from './email-delivery';
export type HelpActor={key:string;name:string;email:string;role:HelpRole;operator:boolean;manage:boolean;edit:boolean};
export async function helpActor():Promise<HelpActor>{
 const admin=await getAdminUser();
 if(admin)return {key:admin.learnerId?'learner:'+admin.learnerId:'operator:'+admin.email,name:admin.email,email:admin.email,role:'platform',operator:!!admin.platformOperator,manage:true,edit:true};
 const learner=await learnerForSession((await cookies()).get('primark_session')?.value);
 if(!learner)throw new CourseError('Sign in first.',401);
 const access=await reportingAccessFor(learner.id),role=access?.scope==='organisation'?'organisation':access?'manager':'learner';
 return {key:'learner:'+learner.id,name:learner.name,email:learner.email,role,operator:false,manage:role==='organisation',edit:false};
}
export async function helpData(actor:HelpActor){
 const {choices}=await featureChoices(),features=Object.fromEntries(featureCatalogue.map(f=>[f.id,effectiveFeature(choices,f.id)]));
 const overrides=(await db().prepare('SELECT id,content,revision FROM help_articles').all<{id:string;content:Partial<HelpArticle>;revision:number}>()).results;
 const articles=helpArticles.map(a=>{const o=overrides.find(o=>o.id===a.id);return {...a,...o?.content,id:a.id,category:a.category,roles:a.roles,feature:a.feature,related:a.related,revision:o?.revision||0};});
 const allowed=visibleHelp(articles,actor.role,features,actor.operator),ids=new Set(allowed.map(a=>a.id));
 return allowed.map(a=>({...a,related:a.related.filter(id=>ids.has(id))}));
}
export async function helpSettings(){return (await db().prepare('SELECT * FROM help_settings WHERE id=1').first<{support_email:string;revision:number}>())!;}
export const requestColumns='id,requester_name,requester_email,topic,subject,message,status,reply,revision,destination,notification,created_at,updated_at,(screenshot IS NOT NULL) AS has_screenshot';
function textField(value:unknown,max:number,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new CourseError('Check the help form details.');return value.trim();}
async function audit(actor:HelpActor,entity:string,id:string,action:string,detail:unknown){await db().prepare('INSERT INTO audit_events(actor,entity,entity_id,action,next_state) VALUES(?,?,?,?,?::jsonb)').bind(actor.email,entity,id,action,JSON.stringify(detail)).run();}
export async function mutateHelp(request:NextRequest){
 const actor=await helpActor();if(!sameOrigin(request))throw new CourseError('Please use the Help page.',403);
 const b=await bodyJson(request,560000);if(!b||typeof b!=='object'||Array.isArray(b))throw new CourseError('Check the help form details.');
 if(b.action==='article'){
  if(!actor.edit)throw new CourseError('Platform admin sign-in is required.',403);
  const base=helpArticles.find(a=>a.id===b.id);if(!base||!(await helpData(actor)).some(a=>a.id===b.id))throw new CourseError('Help article unavailable.',404);
  if(!Array.isArray(b.steps)||b.steps.length<1||b.steps.length>12)throw new CourseError('Check the help form details.');
  const content={title:textField(b.title,160),summary:textField(b.summary,400),steps:b.steps.map((s:unknown)=>textField(s,1500)),faq:textField(b.faq,240),answer:textField(b.answer,2000),image:await normaliseImage(b.image??null)};
  if(!Number.isInteger(b.revision)||b.revision<0)throw new CourseError('Check the help form details.');
  await inTransaction(async()=>{
   const result=await db().prepare(`INSERT INTO help_articles(id,content,updated_by) SELECT ?,?::jsonb,? WHERE ?=0
    ON CONFLICT(id) DO NOTHING RETURNING id`).bind(base.id,JSON.stringify(content),actor.email,b.revision).first();
   if(!result){const saved=await db().prepare('UPDATE help_articles SET content=?::jsonb,revision=revision+1,updated_by=?,updated_at=now() WHERE id=? AND revision=? RETURNING id').bind(JSON.stringify(content),actor.email,base.id,b.revision).first();if(!saved)throw new CourseError('This item changed. Reload before saving.',409);}
   await audit(actor,'help_articles',base.id,'help_article_updated',{title:content.title});
  });return {ok:true};
 }
 if(b.action==='settings'){
  if(!actor.manage)throw new CourseError('Help administration access is required.',403);
  const email=textField(b.email,254,false).toLowerCase();if(email&&!/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(email))throw new CourseError('Enter a valid email address.');
  await inTransaction(async()=>{const row=await db().prepare('UPDATE help_settings SET support_email=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING id').bind(email,b.revision).first();if(!row)throw new CourseError('This item changed. Reload before saving.',409);await audit(actor,'help_settings','1','help_routing_updated',{email});});return {ok:true};
 }
 if(b.action==='status'){
  if(!actor.manage)throw new CourseError('Help administration access is required.',403);
  if(!['open','in_progress','resolved'].includes(b.status))throw new CourseError('Check the help form details.');
  const reply=textField(b.reply,4000,false);
  await inTransaction(async()=>{const row=await db().prepare('UPDATE help_requests SET status=?,reply=?,revision=revision+1,updated_at=now() WHERE id=? AND revision=? RETURNING id').bind(b.status,reply,b.id,b.revision).first();if(!row)throw new CourseError('This item changed. Reload before saving.',409);await audit(actor,'help_requests',b.id,'help_request_updated',{status:b.status,reply});});return {ok:true};
 }
 if(b.action!=='request')throw new CourseError('Check the help form details.');
 const id=textField(b.id,50);if(!/^[a-f0-9-]{36}$/.test(id))throw new CourseError('Check the help form details.');
 const subject=textField(b.subject,160),message=textField(b.message,6000),topic=textField(b.topic,30);
 const available=new Set((await helpData(actor)).map(a=>a.category));if(topic!=='other'&&(!available.has(topic)||!helpCategories.some(c=>c.id===topic)))throw new CourseError('Check the help form details.');
 const screenshot=await normaliseImage(b.screenshot??null),settings=await helpSettings(),tenant=await currentTenant();
 // Resolve the configured fallback before entering the client transaction.
 const recipient=settings.support_email||credentials()?.email||'',destination=settings.support_email?'organisation':'platform';
 let created=false;
 await inTransaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.key+':help']);
  const previous=await db().prepare('SELECT requester_key FROM help_requests WHERE id=?').bind(id).first<{requester_key:string}>();
  if(previous){if(previous.requester_key!==actor.key)throw new CourseError('Check the help form details.',409);return;}
  const count=await db().prepare("SELECT count(*)::integer AS n FROM help_requests WHERE requester_key=? AND created_at>now()-interval '1 hour'").bind(actor.key).first<{n:number}>();
  if((count?.n||0)>=5)throw new CourseError('Too many requests. Please try again later.',429);
  await db().prepare('INSERT INTO help_requests(id,requester_key,requester_name,requester_email,topic,subject,message,screenshot,destination) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,actor.key,actor.name,actor.email,topic,subject,message,screenshot,destination).run();
  await audit(actor,'help_requests',id,'help_request_created',{topic});created=true;
 });
 // An email failure never loses the request. Retried submissions do not send twice.
 if(created&&recipient){try{
  const mode=await db().prepare('SELECT mode FROM email_settings WHERE id=1').first<{mode:string}>();
  if(mode?.mode==='live'&&await featureEnabled('email_notifications')){
   const outcome=await deliverLearningEmail(recipient,{Subject:`Help request ${id}`,TextBody:`A new help request is available for ${tenant.name}.\nReference: ${id}\nSign in to the correct client portal and open Help > Support inbox.`,HtmlBody:'<p>A new help request is available. Sign in to the correct client portal and open Help &gt; Support inbox.</p>'},'help-'+id);
   await db().prepare('UPDATE help_requests SET notification=? WHERE id=?').bind(outcome.status,id).run();
  }
 }catch{console.error('Help notification unavailable');}}
 return {ok:true,id};
}
