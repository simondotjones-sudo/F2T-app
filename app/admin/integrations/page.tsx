import {redirect} from 'next/navigation';
import {requireUserAdministrator} from '@/lib/user-administration';
import Integrations from './integrations';
import '../courses/courses.css';
import './integrations.css';
export const dynamic='force-dynamic';
export default async function Page(){
 try{const actor=await requireUserAdministrator();if(!actor.platformAdmin&&actor.access.scope!=='organisation')redirect('/');}
 catch{redirect('/?login=1&returnTo=%2Fadmin%2Fintegrations');}
 return <Integrations/>;
}
