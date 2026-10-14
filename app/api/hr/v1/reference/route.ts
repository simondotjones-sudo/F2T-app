import {organisationHierarchy} from '@/lib/organisation-hierarchy';
import type {NextRequest} from 'next/server';
import {authenticateHr} from '@/lib/hr-integration';
import {CourseError,failed,json} from '@/lib/course-admin';
import {storeDirectory} from '@/lib/store-directory';
import {departments} from '@/lib/registration-settings';
import {jobRoles} from '@/lib/job-roles';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 if(!request.nextUrl.searchParams.get('client'))throw new CourseError('Specify the client portal slug in ?client=.');
 await authenticateHr(request);
 return json({hierarchy:await organisationHierarchy(),stores:(await storeDirectory(false)).map(s=>({id:s.id,name:s.name,code:s.storeCode,country:s.country,parentGroupId:s.parentUnitId,groupIds:s.unitPath,groupPath:s.unitNames})),departments:(await departments()).filter(d=>!d.archived),jobRoles:(await jobRoles()).filter(r=>!r.archived).map(r=>({id:r.id,name:r.name,externalCode:r.external_code}))});
 }catch(e){return failed(e);}}
