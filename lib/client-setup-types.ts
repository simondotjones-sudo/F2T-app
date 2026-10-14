import type {Language} from './i18n';
import type {LocationTerm} from './tenant-types';
import {featureCatalogue,type FeatureId} from './feature-catalogue';
import type {RegistrationSettings} from './registration-types';
export type SetupSite={name:string;country:string;code:string;groups?:string[]};
export type ClientSetup={hierarchy?:{labels:string[];countryLevel:number|null};requestId:string;name:string;slug:string;logo_url:string;login_background?:string|null;theme_color:string;default_language?:Language;location_term?:LocationTerm;administrator:{name:string;email:string};sites:SetupSite[];departments:string[];registration:Omit<RegistrationSettings,'revision'>;features:Record<FeatureId,boolean>;creditsPerSite:number};
export type SetupResult={id:number;created:boolean;slug:string;activationPath:string|null;expiresAt:string|null};
export const initialSetupFeatures=()=>Object.fromEntries(featureCatalogue.map(f=>[f.id,['renewals','quizzes','bulk_import','lifecycle','learning_time','site_matrix','exclude_within_deadline'].includes(f.id)])) as Record<FeatureId,boolean>;
