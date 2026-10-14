import {createHash,randomBytes} from 'node:crypto';
import {credentials} from './admin-auth';
import {controlQuery,controlTransaction} from './control-database';
import {hashPassword} from './learner-auth';
import {CourseError} from './course-error';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const invalidOperatorCode='This login code is invalid or expired. Ask a platform admin for a new code.';
export function operatorEmail(value:unknown){
 const email=typeof value==='string'?value.trim().toLowerCase():'';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new CourseError('Enter a valid email address.');
 return email;
}
export async function listPlatformOperators(){
 const {rows}=await controlQuery('SELECT email,name,created_at,activated_at,disabled_at,code_expires_at FROM public.lms_platform_operators ORDER BY created_at,email');
 const bootstrap=credentials();
 return [...(bootstrap?[{email:bootstrap.email,name:bootstrap.email,status:'active',bootstrap:true,code_expires_at:null}]:[]),...rows.filter(r=>r.email!==bootstrap?.email).map(r=>({...r,bootstrap:false,status:r.disabled_at?'disabled':r.activated_at?'active':'pending'}))];
}
// The caller must authorise with getPlatformOperator() before management operations.
export async function changePlatformOperator(actor:string,input:Record<string,unknown>){
 const email=operatorEmail(input.email),action=input.action;
 if(email===credentials()?.email||email===actor)throw new CourseError('You cannot change your own access or the primary platform admin.',409);
 if(!['create','code','disable'].includes(String(action)))throw new CourseError('Invalid request.');
 const name=typeof input.name==='string'?input.name.trim():'';
 if(action==='create'&&(name.length<2||name.length>100))throw new CourseError('Enter a name with 2–100 characters.');
 const raw=randomBytes(16).toString('hex').toUpperCase();
 const code=raw.match(/.{8}/g)!.join('-'),expiresAt=new Date(Date.now()+7*86400000).toISOString();
 await controlTransaction(async tx=>{
  // Serialize management and redemption so revocation/reissue cannot race activation.
  await tx.query('SELECT pg_advisory_xact_lock(62111702)');
  if(action==='create'){
   const added=await tx.query('INSERT INTO public.lms_platform_operators(email,name,created_by,code_hash,code_expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING email',[email,name,actor,digest(raw),expiresAt]);
   if(!added.rows.length)throw new CourseError('This platform admin already exists. Use their existing account.',409);
  }else{
   const {rows:[row]}=await tx.query('SELECT email,disabled_at FROM public.lms_platform_operators WHERE email=$1 FOR UPDATE',[email]);
   if(!row)throw new CourseError('Platform admin not found.',404);
   if(action==='disable'){
    await tx.query('UPDATE public.lms_platform_operators SET disabled_at=now(),code_hash=NULL,code_expires_at=NULL WHERE email=$1',[email]);
    await tx.query('DELETE FROM public.admin_sessions WHERE email=$1',[email]);
    await tx.query('DELETE FROM public.lms_platform_resets WHERE account_id=$1',[email]);
   }else{
    // Re-enabling always requires the recipient to redeem the new code.
    await tx.query('UPDATE public.lms_platform_operators SET code_hash=$1,code_expires_at=$2,disabled_at=NULL,password_hash=CASE WHEN disabled_at IS NOT NULL THEN NULL ELSE password_hash END,activated_at=CASE WHEN disabled_at IS NOT NULL THEN NULL ELSE activated_at END WHERE email=$3',[digest(raw),expiresAt,email]);
   }
  }
  await tx.query('INSERT INTO public.lms_platform_operator_audit(actor,email,action) VALUES($1,$2,$3)',[actor,email,action==='disable'?'access_disabled':action==='create'?'invited':'login_code_created']);
 });
 return action==='disable'?{ok:true}:{ok:true,email,code,expiresAt,loginPath:'/platform-access'};
}
export async function redeemPlatformCode(email:string,code:unknown,password:unknown){
 if(email===credentials()?.email)throw new CourseError(invalidOperatorCode,401);
 if(typeof code!=='string'||code.length>100)throw new CourseError(invalidOperatorCode,401);
 const raw=code.replace(/[\s-]/g,'').toUpperCase();
 if(!/^[A-F0-9]{32}$/.test(raw))throw new CourseError(invalidOperatorCode,401);
 if(typeof password!=='string'||password.length<16||password.length>128)throw new CourseError('Create a platform admin password with 16–128 characters.');
 const passwordHash=await hashPassword(password);
 await controlTransaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(62111702)');
  const result=await tx.query('UPDATE public.lms_platform_operators SET password_hash=$1,activated_at=COALESCE(activated_at,now()),code_hash=NULL,code_expires_at=NULL WHERE email=$2 AND code_hash=$3 AND code_expires_at>now() AND disabled_at IS NULL RETURNING email',[passwordHash,email,digest(raw)]);
  if(!result.rows.length)throw new CourseError(invalidOperatorCode,401);
  await tx.query('DELETE FROM public.admin_sessions WHERE email=$1',[email]);
  await tx.query('DELETE FROM public.lms_platform_resets WHERE account_id=$1',[email]);
  await tx.query("INSERT INTO public.lms_platform_operator_audit(actor,email,action) VALUES($1,$1,'login_code_redeemed')",[email]);
 });
}
