import type {MetadataRoute} from 'next';
import type {ClientBrand} from './tenant-types';
import {portalUrl} from './tenant-types';
export function pwaName(brand:ClientBrand){return brand.id===1?'Primark Safety Passport':brand.name;}
export function pwaIconUrl(brand:ClientBrand,size:number){return portalUrl(brand.slug,`/api/pwa/icon?size=${size}&v=${brand.revision}`);}
export function pwaManifest(brand:ClientBrand):MetadataRoute.Manifest{
 return {id:portalUrl(brand.slug,'/'),name:pwaName(brand),short_name:pwaName(brand),description:'Your learning, progress and certificates in one place.',start_url:portalUrl(brand.slug,'/'),scope:'/',display:'standalone',background_color:'#ffffff',theme_color:brand.theme_color,icons:[192,512].flatMap(size=>(['any','maskable'] as const).map(purpose=>({src:pwaIconUrl(brand,size),sizes:`${size}x${size}`,type:'image/png',purpose})))};
}
