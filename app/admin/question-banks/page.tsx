import {redirect} from 'next/navigation';
import {getCourseAdministrator} from '@/lib/course-permissions';
import Banks from './question-banks';
import '../courses/courses.css';
export default async function Page(){if(!await getCourseAdministrator())redirect('/?featureUnavailable=1');return <Banks/>;}
