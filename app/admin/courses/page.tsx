import {getCourseAdministrator} from '@/lib/course-permissions';
import {redirect} from 'next/navigation';
import CourseAdmin from './course-admin';
import './courses.css';
export const dynamic='force-dynamic';
export default async function Page(){if(!await getCourseAdministrator())redirect('/?featureUnavailable=1');return <CourseAdmin/>;}
