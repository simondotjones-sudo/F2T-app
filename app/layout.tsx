import {languageDirection} from '@/lib/i18n';
import type {Metadata,Viewport} from 'next';
import type {CSSProperties} from 'react';
import './globals.css';
import {PwaProvider} from '@/components/pwa-provider';
import {pwaName,pwaIconUrl} from '@/lib/pwa';
import {portalUrl} from '@/lib/tenant-types';
import {FeatureUnavailableNotice} from '@/components/feature-boundary';
import {LanguageProvider} from '@/components/language-provider';
import {BrandingProvider} from '@/components/branding-provider';
import {currentTenant} from '@/lib/tenant-context';
import {publicBrand,themeVariables} from '@/lib/tenant-types';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{const b=await currentTenant();return {title:b.id===1?'Primark Safety Passport':b.name+' | Fit2Trade LMS',description:'Your learning, progress and certificates in one place.',manifest:portalUrl(b.slug,'/api/pwa/manifest'),applicationName:pwaName(b),appleWebApp:{capable:true,title:pwaName(b),statusBarStyle:'default'},icons:{icon:'/favicon.svg',shortcut:'/favicon.svg',apple:[{url:pwaIconUrl(b,180),sizes:'180x180',type:'image/png'}]}};}
export async function generateViewport():Promise<Viewport>{return {width:'device-width',initialScale:1,themeColor:(await currentTenant()).theme_color};}
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){
 const brand=publicBrand(await currentTenant());
 return <html lang={brand.default_language??'en'} dir={languageDirection(brand.default_language??'en')} suppressHydrationWarning style={{...themeVariables(brand.theme_color),...(brand.login_background?{'--login-photo':`url("${brand.login_background}")`}:{})} as CSSProperties} data-client={brand.slug}>
  <body className="antialiased"><script dangerouslySetInnerHTML={{__html:`(()=>{const base=window.fetch.bind(window),client=${JSON.stringify(brand.slug)};window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&url.pathname!=='/api/client-brand'){const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));headers.set('x-lms-expected-client',client);init={...init,headers};}return base(input,init);};})();`}}/><BrandingProvider brand={brand}><LanguageProvider><PwaProvider><FeatureUnavailableNotice/>{children}</PwaProvider></LanguageProvider></BrandingProvider></body>
 </html>;
}
