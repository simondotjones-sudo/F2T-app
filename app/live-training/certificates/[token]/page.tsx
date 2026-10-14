import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {db,learnerForSession} from '@/lib/server';
import {getUserAdministrator} from '@/lib/user-administration';
import LiveCertificate from '@/components/live-certificate';
export const dynamic='force-dynamic';
export const metadata={title:'Training certificate',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){
 const learner=await learnerForSession((await cookies()).get('primark_session')?.value),admin=await getUserAdministrator();if(!learner&&!admin)redirect('/?login=1');
 const r=await db().prepare(`SELECT c.*,e.learner_id,l.store_id,l.country FROM live_certificates c JOIN live_enrolments e ON e.id=c.enrolment_id JOIN learners l ON l.id=e.learner_id WHERE c.token=?`).bind((await params).token).first<any>();
 if(!r)notFound();
 if(!(learner?.id===r.learner_id||admin?.platformAdmin||admin?.access.scope==='organisation'||admin?.access.scope==='country'&&admin.access.country===r.country||admin?.access.scope==='site'&&admin.access.siteId===r.store_id))notFound();
 return <LiveCertificate record={JSON.parse(JSON.stringify(r))}/>;
}
