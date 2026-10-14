import FeaturePage from '@/components/feature-page';
import {redirect} from 'next/navigation';
import {getUserAdministrator} from '@/lib/user-administration';
import EmailAdmin from './email-admin';
import '../courses/courses.css';
import './emails.css';
export const dynamic='force-dynamic';
export default async function Page(){const actor=await getUserAdministrator();if(!actor||(!actor.platformAdmin&&actor.access.scope!=='organisation'))redirect('/');return <FeaturePage feature="email_notifications"><EmailAdmin/></FeaturePage>;}
