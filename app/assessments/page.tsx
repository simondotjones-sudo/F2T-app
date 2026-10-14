import {getCourseAdministrator} from '@/lib/course-permissions';
import {getUserAdministrator} from '@/lib/user-administration';
import {redirect} from 'next/navigation';
import Reports from './reports';
import '../admin/courses/courses.css';
export default async function Page(){const actor=await getUserAdministrator();if(!actor)redirect('/');return <Reports canManage={!!await getCourseAdministrator()} canFeedback={actor.platformAdmin||actor.access.scope==='organisation'}/>;}
