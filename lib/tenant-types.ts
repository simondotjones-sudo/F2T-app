import type {Language} from './i18n';
export type LocationTerm='site'|'store';
export type ClientBrand={id:number;name:string;slug:string;logo_url:string;theme_color:string;revision:number;default_language?:Language;location_term?:LocationTerm|null;login_background?:string|null};
export type Tenant=ClientBrand&{schema_name:string;role_name:string;active:boolean;registration_code:string};
export const DEFAULT_BRAND:ClientBrand={id:2,name:'Fit2Trade',slug:'fit2trade',logo_url:'/branding/fit2trade-logo.svg',theme_color:'#2E6052',revision:2};
// Keep the registry identifier and old links stable; expose the Fit2Trade portal address.
export function canonicalClientSlug(slug:string){return slug==='eazysafe-internal'?DEFAULT_BRAND.slug:slug;}
export function publicBrand(t:ClientBrand):ClientBrand{return {id:Number(t.id),name:t.name,slug:canonicalClientSlug(t.slug),logo_url:t.logo_url,theme_color:t.theme_color,revision:t.revision,login_background:t.login_background,default_language:t.default_language??'en',location_term:t.location_term??null};}
export function portalUrl(slug:string,path='/'){const destination=new URL(path,'https://local.invalid');destination.searchParams.set('client',canonicalClientSlug(slug));return destination.pathname+destination.search+destination.hash;}
export function validLogo(value:unknown):value is string{return typeof value==='string'&&(value==='/branding/fit2trade-logo.svg'||value==='/branding/eazysafe-logo.png'||value==='/branding/primark-logo.svg'||(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<=700000));}
export function themeVariables(color:string){
 const safe=/^#[a-f\d]{6}$/i.test(color)?color:DEFAULT_BRAND.theme_color;
 const channel=[1,3,5].map(i=>parseInt(safe.slice(i,i+2),16));
 const luminance=channel.map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 const contrast=luminance>.179?'#17212b':'#ffffff';
 return {'--brand':safe,'--brand-ink':luminance>.179?`color-mix(in srgb, ${safe} 45%, #17212b)`:safe,'--brand-contrast':contrast,'--brand-hover':`color-mix(in srgb, ${safe} 82%, #000)`,'--brand-soft':`color-mix(in srgb, ${safe} 8%, #fff)`,'--brand-border':`color-mix(in srgb, ${safe} 24%, #fff)`,'--primary':safe,'--primary-foreground':contrast,'--ring':safe,'--accent':`color-mix(in srgb, ${safe} 8%, #fff)`,'--accent-foreground':luminance>.179?'#17212b':safe};
}
