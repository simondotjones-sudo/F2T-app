import type {NextRequest} from 'next/server';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {sameOrigin} from '@/lib/request-origin';
import {catalogueOperator,catalogueClients,catalogueOverview,publishCatalogueRelease,distributeCatalogueRelease,withdrawCatalogueCourse} from '@/lib/shared-catalogue';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await catalogueOverview());}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await catalogueOperator();if(!sameOrigin(request))throw new CourseError('Please use the catalogue page.',403);
 const b=await bodyJson(request,10000),clients=await catalogueClients();
 const source=clients.find(c=>c.id===b.sourceClientId),target=clients.find(c=>c.id===b.clientId);
 if(b.action==='publish'&&source&&typeof b.courseId==='string'&&Number.isSafeInteger(b.revision))return json(await publishCatalogueRelease(source,b.courseId,b.revision,actor.email));
 if(b.action==='distribute'&&source&&target&&typeof b.releaseId==='string'&&Number.isSafeInteger(b.version))return json(await distributeCatalogueRelease(source,target,b.releaseId,actor.email,b.version));
 if(b.action==='withdraw'&&target&&typeof b.courseId==='string'&&Number.isSafeInteger(b.version)){await withdrawCatalogueCourse(target,b.courseId,b.version,actor.email);return json({ok:true});}
 throw new CourseError('Choose a course and client.');
 }catch(e){return failed(e);}}
