import {currentTenant} from './tenant-context';
export async function tenantFileKey(key:string){const t=await currentTenant();return t.id===1?key:`clients/${t.id}/${key}`;}
export async function assertTenantFileKey(key:string){const t=await currentTenant();if(t.id===1?key.startsWith('clients/'):!key.startsWith(`clients/${t.id}/`))throw new Error('File not available for this client.');return key;}
