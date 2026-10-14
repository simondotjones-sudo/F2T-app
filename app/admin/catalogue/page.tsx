import {redirect} from 'next/navigation';
import {getPlatformOperator} from '@/lib/admin-auth';
import Catalogue from './catalogue';
export const dynamic='force-dynamic';
export default async function Page(){if(!await getPlatformOperator())redirect('/?login=1&returnTo=%2Fadmin%2Fcatalogue');return <Catalogue/>;}
