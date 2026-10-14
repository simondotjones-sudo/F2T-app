import type {NextRequest} from 'next/server';
import {bodyJson,failed,json} from '@/lib/course-admin';
import {requireUserAdministrator} from '@/lib/user-administration';
import {changeHierarchy,organisationHierarchy,visibleHierarchy} from '@/lib/organisation-hierarchy';
export const dynamic='force-dynamic';
export async function GET(){try{const actor=await requireUserAdministrator();return json({...visibleHierarchy(await organisationHierarchy(),actor.access),access:actor.access});}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{const actor=await requireUserAdministrator(request);return json(await changeHierarchy(actor,await bodyJson(request,20000)));}catch(e){if((e as {code?:string}).code==='23505')return json({error:'A group with this name or code already exists.'},409);return failed(e);}}
