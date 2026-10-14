'use client';
import {BrandLogo} from './branding-provider';
import {useLanguage} from './language-provider';
import '@/app/live-training/live-training.css';
export default function LiveCertificate({record:r}:{record:any}){const {t,date}=useLanguage();return <main className="live-certificate"><div className="no-print live-actions"><a href="/?courses=1">{t('My Courses')}</a><button onClick={()=>window.print()}>{t('Print / Save PDF')}</button></div><BrandLogo/>
 {r.revoked_at&&<p role="alert" className="error">{t('Certificate revoked')} · {date(r.revoked_at)}</p>}
 <h1>{t('Certificate of Completion')}</h1><p>{t('Awarded to')}</p><h2>{r.snapshot.learner_name}</h2><p>{t('For completing')}</p><h3>{r.snapshot.title}</h3><p>{t('Trainer')} · {r.snapshot.trainer}</p><p>{t('Duration')} · {r.snapshot.duration_minutes} {t('minutes')}</p><p>{t('Completed')} · {date(r.completed_at)}</p><p>{r.expires_at?t('Expires {date}',{date:date(r.expires_at)}):t('No expiry')}</p><footer>{t('Certificate ID')} · {r.token}</footer></main>;}
