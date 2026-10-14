import {redirect} from 'next/navigation';
import {getPlatformOperator} from '@/lib/admin-auth';
import Operators from './operators';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await getPlatformOperator())redirect('/?login=1&returnTo=%2Fadmin%2Foperators');
 return <Operators/>;
}
