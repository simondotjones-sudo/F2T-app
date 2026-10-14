import FeaturePage from '@/components/feature-page';
import {redirect} from 'next/navigation';
import {getUserAdministrator} from '@/lib/user-administration';
import LiveTraining from './live-training';
export const dynamic='force-dynamic';
export default async function Page(){if(!await getUserAdministrator())redirect('/?login=1&returnTo=%2Flive-training');return <FeaturePage feature="live_training"><LiveTraining/></FeaturePage>;}
