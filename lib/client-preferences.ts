import {isLanguage,type Language} from './i18n';
import type {ClientBrand} from './tenant-types';
export const languagePreferenceKey=(slug:string)=>`lms-language:${slug}`;
export function resolveClientLanguage(brand:ClientBrand,saved:unknown,query:unknown,legacy:unknown=null):Language{
 // Legacy portals retain their browser preference; new portals never inherit another client's.
 return isLanguage(saved)?saved:isLanguage(query)?query:brand.location_term==null&&(brand.default_language??'en')==='en'&&isLanguage(legacy)?legacy:brand.default_language??'en';
}
