import {redirect} from 'next/navigation';
import {helpActor} from '@/lib/help-server';
import HelpCentre from './help-centre';
import './help.css';
export default async function Page(){try{await helpActor();}catch{redirect('/?login=1&returnTo=%2Fhelp');}return <HelpCentre/>;}
