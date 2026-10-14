export type RegistrationSettings={self_registration_enabled:boolean;employee_id_label:string;employee_id_required:boolean;registration_code:string;revision:number};
export type Department={id:string;name:string;archived:boolean};
export type PublicRegistration=Omit<RegistrationSettings,'registration_code'|'revision'>&{departments:Department[]};
