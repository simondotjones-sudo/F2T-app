import {createHash,randomBytes} from 'node:crypto';
import {db,inTransaction} from '@/lib/database';
import {controlQuery,controlTransaction} from '@/lib/control-database';
import {credentialFingerprint,credentials,namedPlatformOperator,operatorFingerprint,sessionCredentialFingerprint} from '@/lib/admin-auth';
import {hashPassword,validPassword} from '@/lib/learner-auth';
import {tr} from '@/lib/ui-copy';
import {isLanguage,type Language} from '@/lib/i18n';
import {passwordResetHtml} from '@/lib/email-templates';
import {emailConnection} from '@/lib/email-delivery';
import {runtimeEnv} from '@/lib/runtime-env';
import {currentTenant} from '@/lib/tenant-context';
import {portalUrl} from '@/lib/tenant-types';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const learnerFingerprint=(row:{password_hash:unknown;code_hash:unknown})=>digest(JSON.stringify([row.password_hash,row.code_hash]));
const invalidLink='This reset link has expired or has already been used. Request a new one.';
export class RecoveryError extends Error{}
function mailSettings(){const c=emailConnection();if(!c.ready)throw new RecoveryError('Password recovery is not available yet. Please contact your administrator.');return c;}
export async function requestPasswordReset(email:string,requestedLanguage?:Language,reportDeliveryFailure=false){
 const settings=mailSettings(),tenant=await currentTenant(),lang=isLanguage(requestedLanguage)?requestedLanguage:tenant.default_language??'en';
 const learner=await db().prepare(`SELECT id,password_hash,code_hash,EXISTS(SELECT 1 FROM platform_admins p WHERE p.learner_id=learners.id) AS platform_admin FROM learners WHERE email=? AND archived_at IS NULL`).bind(email).first<{id:string;password_hash:string|null;code_hash:string;platform_admin:boolean}>();
 const accounts:{type:string;id:string;fingerprint:string;label:string}[]=[];
 if(email===credentials()?.email)accounts.push({type:'admin',id:email,fingerprint:await sessionCredentialFingerprint(),label:'Platform admin'});
 else {const operator=await namedPlatformOperator(email);if(operator?.password_hash&&!operator.disabled_at)accounts.push({type:'admin',id:email,fingerprint:operatorFingerprint(operator.password_hash),label:'Platform admin'});}
 if(learner)accounts.push({type:'learner',id:learner.id,fingerprint:learnerFingerprint(learner),label:learner.platform_admin?'Platform admin':'Learning account'});
 await db().prepare('DELETE FROM password_resets WHERE expires_at<NOW()').run();
 await controlQuery('DELETE FROM public.lms_platform_resets WHERE expires_at<NOW()');
 if(!accounts.length)return;
 const links:string[]=[],hashes:{token:string;admin:boolean}[]=[];
 for(const account of accounts){const token=randomBytes(32).toString('hex'),tokenHash=digest(token),expires=new Date(Date.now()+30*60000).toISOString();
  if(account.type==='admin')await controlQuery('INSERT INTO public.lms_platform_resets(token_hash,account_id,credential_hash,expires_at) VALUES($1,$2,$3,$4)',[tokenHash,account.id,account.fingerprint,expires]);
  else await db().prepare('INSERT INTO password_resets(token_hash,account_type,account_id,credential_hash,expires_at) VALUES(?,?,?,?,?)').bind(tokenHash,account.type,account.id,account.fingerprint,expires).run();
  hashes.push({token:tokenHash,admin:account.type==='admin'});
  links.push(`${tr(lang,account.label)}: ${settings.origin}${portalUrl(tenant.slug,`/reset-password/?lang=${lang}#token=${token}`)}`);
 }
 try{const response=await fetch('https://api.postmarkapp.com/email',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','Accept':'application/json','X-Postmark-Server-Token':settings.token},body:JSON.stringify({From:settings.from,To:email,HtmlBody:passwordResetHtml(lang,links,tenant),Subject:tr(lang,'Reset your Primark password').replaceAll('Primark',tenant.name),TextBody:`${tr(lang,'Reset your Primark Safety Passport password using the link below. Each link expires in 30 minutes and can be used once.').replaceAll('Primark Safety Passport',tenant.name+' LMS')}\n\n${links.join('\n\n')}\n\n${tr(lang,'If you did not request this, you can ignore this email. Your password has not changed.')}`,MessageStream:runtimeEnv('POSTMARK_MESSAGE_STREAM')||'outbound',TrackOpens:false,TrackLinks:'None'})});const result=await response.json();if(!response.ok||result.ErrorCode!==0)throw new Error('Delivery failed');}
 catch{for(const h of hashes){if(h.admin)await controlQuery('DELETE FROM public.lms_platform_resets WHERE token_hash=$1',[h.token]);else await db().prepare('DELETE FROM password_resets WHERE token_hash=?').bind(h.token).run();}console.error('Password recovery email could not be delivered. Check the sender configuration.');if(reportDeliveryFailure)throw new RecoveryError('The password reset email could not be sent. Please try again later.');}
}
export async function resetPassword(token:unknown,password:unknown){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new RecoveryError(invalidLink);
 if(!validPassword(password))throw new RecoveryError('Create a password with 8–128 characters.');
 const passwordHash=await hashPassword(password),tokenHash=digest(token);
 const platform=await controlTransaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(62111701)');
  await client.query('SELECT pg_advisory_xact_lock(62111702)');
  const reset=(await client.query('SELECT * FROM public.lms_platform_resets WHERE token_hash=$1 AND expires_at>NOW() FOR UPDATE',[tokenHash])).rows[0];if(!reset)return false;
  if(password.length<16)throw new RecoveryError('Create a platform admin password with 16–128 characters.');
  if(credentials()?.email!==reset.account_id){
   const {rows:[operator]}=await client.query('SELECT password_hash,disabled_at FROM public.lms_platform_operators WHERE email=$1 FOR UPDATE',[reset.account_id]);
   if(!operator?.password_hash||operator.disabled_at||operatorFingerprint(String(operator.password_hash))!==reset.credential_hash)throw new RecoveryError(invalidLink);
   await client.query('UPDATE public.lms_platform_operators SET password_hash=$1,code_hash=NULL,code_expires_at=NULL WHERE email=$2',[passwordHash,reset.account_id]);
   await client.query('DELETE FROM public.admin_sessions WHERE email=$1',[reset.account_id]);
   await client.query('DELETE FROM public.lms_platform_resets WHERE account_id=$1',[reset.account_id]);
   await client.query("INSERT INTO public.lms_platform_operator_audit(actor,email,action) VALUES($1,$1,'password_reset')",[reset.account_id]);
   return true;
  }
  const bootstrap=credentialFingerprint();const row=(await client.query('SELECT * FROM public.admin_passwords WHERE email=$1 FOR UPDATE',[reset.account_id])).rows[0];
  const fingerprint=row?.bootstrap_hash===bootstrap?digest(bootstrap+':'+row.password_hash):bootstrap;if(fingerprint!==reset.credential_hash)throw new RecoveryError(invalidLink);
  await client.query('INSERT INTO public.admin_passwords(email,bootstrap_hash,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET bootstrap_hash=EXCLUDED.bootstrap_hash,password_hash=EXCLUDED.password_hash',[reset.account_id,bootstrap,passwordHash]);
  await client.query('DELETE FROM public.admin_sessions WHERE email=$1',[reset.account_id]);await client.query('DELETE FROM public.lms_platform_resets WHERE account_id=$1',[reset.account_id]);return true;
 });
 if(platform)return;
 await inTransaction(async client=>{
  const reset=(await client.query("SELECT * FROM password_resets WHERE token_hash=$1 AND expires_at>NOW() AND account_type='learner' FOR UPDATE",[tokenHash])).rows[0];if(!reset)throw new RecoveryError(invalidLink);
  const row=(await client.query('SELECT password_hash,code_hash,EXISTS(SELECT 1 FROM reporting_access r WHERE r.learner_id=learners.id) OR EXISTS(SELECT 1 FROM platform_admins p WHERE p.learner_id=learners.id) AS admin_only FROM learners WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[reset.account_id])).rows[0];if(!row||learnerFingerprint({password_hash:row.password_hash,code_hash:row.code_hash})!==reset.credential_hash)throw new RecoveryError(invalidLink);
  if(row.admin_only&&password.length<16)throw new RecoveryError('Admin passwords need 16–128 characters.');
  await client.query('UPDATE learners SET password_hash=$1,code_hash=$2 WHERE id=$3',[passwordHash,digest(randomBytes(32).toString('hex')),reset.account_id]);await client.query('DELETE FROM sessions WHERE learner_id=$1',[reset.account_id]);await client.query('DELETE FROM password_resets WHERE account_id=$1',[reset.account_id]);
 });
}
