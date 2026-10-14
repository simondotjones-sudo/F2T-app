import {publicRegistration} from '@/lib/registration-settings';
import {failed,json} from '@/lib/course-admin';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await publicRegistration());}catch(e){return failed(e);}}
