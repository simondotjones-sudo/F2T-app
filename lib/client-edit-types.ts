import type {ClientBrand} from './tenant-types';
import type {FeatureChoices} from './feature-catalogue';
import type {Department,RegistrationSettings} from './registration-types';
export type EditableSite={id:string;name:string;country:string;code:string;active:boolean};
export type ClientEdit={client:ClientBrand;sites:EditableSite[];departments:Department[];registration:RegistrationSettings;choices:FeatureChoices;revisionToken:string};
