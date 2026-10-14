import {NextRequest} from 'next/server';
import {getPlatformOperator} from '@/lib/admin-auth';
import {bodyJson,CourseError,failed} from '@/lib/course-admin';
import {controlQuery,controlTransaction} from '@/lib/control-database';
import {sameOrigin} from '@/lib/request-origin';
import {canonicalClientSlug,DEFAULT_BRAND,validLogo,type ClientBrand} from '@/lib/tenant-types';
export const dynamic='force-dynamic';
async function actor(request?:NextRequest){const a=await getPlatformOperator();if(!a)throw new CourseError('Platform administrator access is required.',403);if(request&&!sameOrigin(request))throw new CourseError('Please use the Clients page.',403);return a;}
function fields(b:Record<string,unknown>,create:boolean){
 const name=typeof b.name==='string'?b.name.trim():'';const slug=typeof b.slug==='string'?b.slug.trim().toLowerCase():'';
 const logo=b.logo_url||DEFAULT_BRAND.logo_url;const color=(typeof b.theme_color==='string'?b.theme_color:DEFAULT_BRAND.theme_color).toLowerCase();
 if(name.length<2||name.length>100)throw new CourseError('Enter a client name with 2–100 characters.');
 if(create&&canonicalClientSlug(slug)===DEFAULT_BRAND.slug)throw new CourseError('That portal address is already in use.',409);
 if(create&&(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<2||slug.length>60))throw new CourseError('Use 2–60 lowercase letters, numbers and hyphens for the portal address.');
 if(!validLogo(logo))throw new CourseError('Upload a PNG, JPEG or WebP logo.');
 if(!/^#[a-f0-9]{6}$/.test(color))throw new CourseError('Choose a valid theme colour.');
 return {name,slug,logo,color};
}
export async function GET(){try{await actor();const rows=(await controlQuery<ClientBrand>('SELECT id,name,slug,logo_url,theme_color,revision,default_language,location_term,setup_completed_at FROM public.lms_clients WHERE active ORDER BY id')).rows;return Response.json({clients:rows.map(r=>({...r,id:Number(r.id),slug:canonicalClientSlug(r.slug)}))},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{const a=await actor(request);const b=await bodyJson(request,750000) as Record<string,unknown>;const f=fields(b,true);
 const {rows}=await controlQuery<{id:string}>('SELECT public.lms_create_client($1,$2,$3,$4,$5) AS id',[f.name,f.slug,f.logo,f.color,a.email]);
 return Response.json({ok:true,id:Number(rows[0].id)},{status:201});
}catch(e){if((e as {code?:string}).code==='23505')return Response.json({error:'That portal address is already in use.'},{status:409});return failed(e);}}
export async function PATCH(request:NextRequest){try{const a=await actor(request);const b=await bodyJson(request,750000) as Record<string,unknown>;const f=fields(b,false);
 if(!Number.isSafeInteger(b.id)||!Number.isSafeInteger(b.revision))throw new CourseError('Choose a client.');
 await controlTransaction(async tx=>{const {rows}=await tx.query('UPDATE public.lms_clients SET name=$1,logo_url=$2,theme_color=$3,revision=revision+1,updated_at=now() WHERE id=$4 AND revision=$5 RETURNING id',[f.name,f.logo,f.color,b.id,b.revision]);if(!rows.length)throw new CourseError('This client changed. Refresh and try again.',409);await tx.query("INSERT INTO public.lms_client_audit(client_id,actor,action,details) VALUES($1,$2,'branding_updated',$3)",[b.id,a.email,JSON.stringify({name:f.name,theme_color:f.color})]);});
 return Response.json({ok:true});
}catch(e){return failed(e);}}
