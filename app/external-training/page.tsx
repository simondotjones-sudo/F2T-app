import {redirect} from 'next/navigation';
import {learnerForSession} from '@/lib/server';
import {cookies} from 'next/headers';
import {getUserAdministrator} from '@/lib/user-administration';
import ExternalTraining from './training';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{admin?:string}>}){const admin=(await searchParams).admin==='1';if(admin?!await getUserAdministrator():!await learnerForSession((await cookies()).get('primark_session')?.value))redirect('/?login=1');return <ExternalTraining admin={admin}/>;}
