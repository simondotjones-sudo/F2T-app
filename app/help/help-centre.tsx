'use client';
import {useEffect,useState} from 'react';
import {BookOpen,Search,ChevronRight,ArrowLeft,Compass,Award,Users,Send,ChartColumn,PenLine,Settings,Building2,CheckCircle2,LifeBuoy} from 'lucide-react';
import PageHeader from '@/components/page-header';
import {useLanguage} from '@/components/language-provider';
import {helpCategories,type HelpArticle} from '@/lib/help-content';
import {prepareImage} from '@/lib/image-upload';
import type {HelpActor} from '@/lib/help-server';
type HelpRequest={id:string;requester_name:string;requester_email:string;topic:string;subject:string;message:string;status:string;reply:string;revision:number;has_screenshot:boolean;created_at:string;notification:string};
type Data={actor:HelpActor;organisation:string;articles:HelpArticle[];settings:{support_email:string;revision:number}|null;requests:HelpRequest[];hasMore:boolean};
const icons:Record<string,typeof BookOpen>={compass:Compass,book:BookOpen,award:Award,users:Users,send:Send,chart:ChartColumn,pen:PenLine,settings:Settings,building:Building2};
const statusLabel:Record<string,string>={open:'Open',in_progress:'In progress',resolved:'Resolved'};
async function post(body:unknown){const r=await fetch('/api/help',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);return d;}
export default function HelpCentre(){
 const {t,date}=useLanguage();
 const [tab,setTab]=useState('Guide'),[data,setData]=useState<Data|null>(null),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[articleId,setArticleId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[page,setPage]=useState(0),[loading,setLoading]=useState(true),[editing,setEditing]=useState<HelpArticle|null>(null);
 const [subject,setSubject]=useState(''),[message,setMessage]=useState(''),[topic,setTopic]=useState('other'),[screenshot,setScreenshot]=useState<string|null>(null),[requestId,setRequestId]=useState(''),[receipt,setReceipt]=useState(''),[uploading,setUploading]=useState(false);
 const inbox=tab==='Support inbox';
 useEffect(()=>{const p=new URLSearchParams(location.search);setCategory(p.get('category')||'');setArticleId(p.get('article')||'');setRequestId(crypto.randomUUID());},[]);
 useEffect(()=>{let active=true;setLoading(true);setError('');fetch(`/api/help?inbox=${inbox?'1':'0'}&page=${page}`,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[inbox,page,refresh]);
 const article=data?.articles.find(a=>a.id===articleId),q=query.trim().toLowerCase();
 const categories=helpCategories.filter(c=>data?.articles.some(a=>a.category===c.id));
 const results=data?.articles.filter(a=>(!category||a.category===category)&&(!q||[a.title,a.summary,a.faq,a.answer,...a.steps].join(' ').toLowerCase().includes(q)))||[];
 const searchCategory=helpCategories.find(c=>c.id===category);
 function navigate(next:string){if(editing&&!confirm(t('Discard unsaved changes?')))return;setEditing(null);setTab(next);setPage(0);setError('');setNotice('');}
 async function run(body:unknown){setBusy(true);setError('');try{await post(body);setNotice('Saved.');setRefresh(v=>v+1);return true;}catch(e){setError(e instanceof Error?e.message:'Please try again.');return false;}finally{setBusy(false);}}
 async function upload(file:File|undefined,editor=false){if(!file)return;setUploading(true);setError('');try{const value=await prepareImage(file);if(editor)setEditing(a=>a?{...a,image:value}:null);else setScreenshot(value);}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setUploading(false);}}
 function openArticle(id:string){setArticleId(id);setQuery('');setEditing(null);history.replaceState(history.state,'',`/help?article=${encodeURIComponent(id)}`);}
 function back(){setArticleId('');setCategory('');setQuery('');history.replaceState(history.state,'','/help');}
 return <main className="help-shell"><PageHeader title={t("Help")} view="help"/>
 <div className="help-tabs" role="tablist" aria-label={t('Help')}>{['Guide','FAQs','Contact',...(data?.actor.manage?['Support inbox']:[])].map(v=><button key={v} type="button" role="tab" aria-selected={tab===v} aria-controls="help-content" onClick={()=>navigate(v)}>{t(v)}</button>)}</div>
 {error&&<p className="help-error" role="alert">{t(error)} <button type="button" onClick={()=>setRefresh(v=>v+1)}>{t('Reload')}</button></p>}{notice&&<p role="status" className="help-notice">{t(notice)}</p>}
 <section id="help-content" role="tabpanel" aria-label={t(tab)}>
 {!data?<p role="status">{t('Loading…')}</p>:<>
 {(tab==='Guide'||tab==='FAQs')&&<>
 <div className="help-heading"><span className="help-eyebrow"><LifeBuoy size={18}/>{t('Help')}</span><h2>{t('How can we help?')}</h2><p>{t('Browse by topic or search the guide.')}</p></div>
 <label className="help-search"><span className="sr-only">{t('Search help')}</span><input value={query} onChange={e=>{setQuery(e.target.value);setArticleId('');}} placeholder={t('Search help')}/><Search size={20}/></label>
 <p className="help-muted">{t('Guide content is in English.')}</p>
 {articleId&&!article&&<p role="status">{t('Help article unavailable.')} <button onClick={back}>{t('Back to categories')}</button></p>}
 {article&&tab==='Guide'?<article className="help-panel help-article">
 <button className="help-back" onClick={back}><ArrowLeft size={17}/>{t('Back to categories')}</button>
 {editing?<form onSubmit={async e=>{e.preventDefault();if(await run({action:'article',...editing}))setEditing(null);}}>
 <p>{t('Edits apply to the selected organisation.')}</p>
 {(['title','summary','faq','answer'] as const).map(k=><label key={k}>{t(({title:'Title',summary:'Summary',faq:'FAQ question',answer:'Answer'})[k])}<textarea aria-label={t(({title:'Title',summary:'Summary',faq:'FAQ question',answer:'Answer'})[k])} required maxLength={k==='title'?160:k==='summary'?400:k==='faq'?240:2000} value={editing[k]} onChange={e=>setEditing({...editing,[k]:e.target.value})}/></label>)}
 <label>{t('Steps — one per line')}<textarea aria-label={t('Steps — one per line')} required rows={8} value={editing.steps.join('\n')} onChange={e=>setEditing({...editing,steps:e.target.value.split('\n')})}/></label>
 <label>{t('Screenshot (optional)')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>void upload(e.target.files?.[0],true)}/></label>
 {editing.image&&<><img className="help-image" src={editing.image} alt={editing.title}/><button type="button" onClick={()=>setEditing({...editing,image:null})}>{t('Remove image')}</button></>}
 <div className="help-actions"><button className="help-primary" disabled={busy||uploading}>{t('Save changes')}</button><button type="button" onClick={()=>{if(confirm(t('Discard unsaved changes?')))setEditing(null);}}>{t('Cancel')}</button></div>
 </form>:<><div lang="en"><h2>{article.title}</h2><p>{article.summary}</p><ol>{article.steps.map((s,i)=><li key={i}>{s}</li>)}</ol>{article.image&&<img className="help-image" src={article.image} alt={article.title}/>}</div>
 {article.related.length>0&&<><h3>{t('Related help')}</h3><div className="help-related">{article.related.map(id=><button lang="en" key={id} onClick={()=>openArticle(id)}>{data.articles.find(a=>a.id===id)?.title}<ChevronRight size={16}/></button>)}</div></>}
 <div className="help-actions"><button onClick={()=>navigate('Contact')}>{t('Still need help?')}</button>{data.actor.edit&&<button onClick={()=>setEditing(structuredClone(article))}>{t('Edit article')}</button>}</div></>}
 </article>:<>
 {category&&<button className="help-back" onClick={back}><ArrowLeft size={17}/>{t('Back to categories')}</button>}
 {!category&&!q?<div className="help-grid">{categories.map(c=>{const Icon=icons[c.icon];return <button className="help-card" key={c.id} onClick={()=>{setCategory(c.id);setArticleId('');}}><span className="help-icon"><Icon size={24}/></span><strong>{t(c.title)}</strong><span className="help-muted">{t('{count} articles',{count:data.articles.filter(a=>a.category===c.id).length})}</span><ChevronRight className="help-chevron" size={20}/></button>;})}</div>:<div className="help-panel"><h2>{q?t('Search results'):t(searchCategory?.title||'Guide')}</h2>{!results.length&&<p>{t('No help articles match your search.')}</p>}
 {tab==='FAQs'?results.map(a=><details className="help-faq" key={a.id}><summary lang="en">{a.faq}</summary><p lang="en">{a.answer}</p><button onClick={()=>{setTab('Guide');openArticle(a.id);}}>{t('Read guide')}</button></details>):results.map(a=><button lang="en" className="help-result" key={a.id} onClick={()=>openArticle(a.id)}><span><strong>{a.title}</strong><small>{a.summary}</small></span><ChevronRight size={18}/></button>)}
 </div>}
 </>}
 </>}
 {tab==='Contact'&&<div className="help-contact-grid"><div className="help-panel"><h2>{t('Contact support')}</h2><p>{t('Your request is saved in the support inbox. Check back here for updates.')}</p>
 {receipt&&<div className="help-receipt" role="status"><CheckCircle2/><strong>{t('Request received')}</strong><span>{t('Reference')}: <bdi>{receipt}</bdi></span></div>}
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const d=await post({action:'request',id:requestId,topic,subject,message,screenshot});setReceipt(d.id);setRequestId(crypto.randomUUID());setSubject('');setMessage('');setScreenshot(null);setRefresh(v=>v+1);}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}}>
 <div className="help-identity"><strong>{data.actor.name}</strong><span>{data.actor.email}</span><span>{data.organisation}</span></div>
 <label>{t('Topic')}<select aria-label={t('Topic')} value={topic} onChange={e=>setTopic(e.target.value)}><option value="other">{t('Other')}</option>{categories.map(c=><option value={c.id} key={c.id}>{t(c.title)}</option>)}</select></label>
 <label>{t('Subject')}<input required maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
 <label>{t('Message')}<textarea required maxLength={6000} rows={6} value={message} onChange={e=>setMessage(e.target.value)}/></label>
 <p className="help-muted">{t('Do not include passwords or sensitive personal information.')}</p>
 <label>{t('Screenshot (optional)')}<input key={requestId} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>void upload(e.target.files?.[0])}/></label>
 <small>{t('Choose a PNG, JPEG or WebP image up to 5 MB.')}</small>
 {screenshot&&<><img src={screenshot} className="help-image" alt={t('Screenshot (optional)')}/><button type="button" onClick={()=>setScreenshot(null)}>{t('Remove image')}</button></>}
 <button className="help-primary" disabled={busy||uploading||!requestId}>{t(busy?'Saving…':'Submit request')}</button>
 </form></div><div className="help-panel"><h2>{t('My requests')}</h2>{loading?<p>{t('Loading…')}</p>:<>{!data.requests.length&&<p>{t('No requests yet.')}</p>}{data.requests.map(r=><details className="help-faq" key={r.id}><summary>{r.subject}<small>{t(statusLabel[r.status])} · {date(r.created_at)}</small></summary><p className="help-preserve">{r.message}</p><small>{t('Reference')}: <bdi>{r.id}</bdi></small>{r.has_screenshot&&<p><a href={`/api/help/screenshot/${r.id}`}>{t('Download screenshot')}</a></p>}{r.reply&&<><h3>{t('Support response')}</h3><p className="help-preserve">{r.reply}</p></>}</details>)}</>}
 <Pagination page={page} more={data.hasMore} loading={loading} setPage={setPage}/><button onClick={()=>setRefresh(v=>v+1)}>{t('Refresh')}</button></div></div>}
 {inbox&&data.actor.manage&&<div className="help-panel"><h2>{t('Support inbox')}</h2><p>{data.organisation}</p><p>{t('Replies are shown in the requester’s Help section.')}</p>
 {data.settings&&<Routing key={data.settings.revision} settings={data.settings} busy={busy} save={run}/>}
 {loading?<p>{t('Loading…')}</p>:<>{!data.requests.length&&<p>{t('No requests yet.')}</p>}{data.requests.map(r=><RequestEditor key={`${r.id}-${r.revision}`} request={r} busy={busy} save={run}/>)}</>}
 <Pagination page={page} more={data.hasMore} loading={loading} setPage={setPage}/></div>}
 </>}
 </section></main>;
}
function Pagination({page,more,loading,setPage}:{page:number;more:boolean;loading:boolean;setPage:(n:number)=>void}){const {t}=useLanguage();return (page>0||more)&&<div className="help-actions"><button disabled={!page||loading} onClick={()=>setPage(page-1)}>{t('Previous')}</button><button disabled={!more||loading} onClick={()=>setPage(page+1)}>{t('Next')}</button></div>;}
function Routing({settings,busy,save}:{settings:NonNullable<Data['settings']>;busy:boolean;save:(b:unknown)=>Promise<boolean>}){const {t}=useLanguage(),[email,setEmail]=useState(settings.support_email);return <details className="help-faq"><summary>{t('Support routing')}</summary><p>{t('Leave blank to use the platform support contact. Email alerts require live email delivery; requests are always kept here.')}</p><form onSubmit={e=>{e.preventDefault();void save({action:'settings',email,revision:settings.revision});}}><label>{t('Support email')}<input type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><button disabled={busy}>{t('Save changes')}</button></form></details>;}
function RequestEditor({request:r,busy,save}:{request:HelpRequest;busy:boolean;save:(b:unknown)=>Promise<boolean>}){const {t,date}=useLanguage(),[status,setStatus]=useState(r.status),[reply,setReply]=useState(r.reply);return <details className="help-faq"><summary>{r.subject}<small>{t(statusLabel[r.status])} · {date(r.created_at)}</small></summary><p>{r.requester_name} · {r.requester_email}</p><small>{t('Reference')}: <bdi>{r.id}</bdi></small><p className="help-preserve">{r.message}</p>{r.has_screenshot&&<p><a href={`/api/help/screenshot/${r.id}`}>{t('Download screenshot')}</a></p>}<form onSubmit={e=>{e.preventDefault();void save({action:'status',id:r.id,status,reply,revision:r.revision});}}><label>{t('Status')}<select aria-label={t('Status')} value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statusLabel).map(([k,v])=><option key={k} value={k}>{t(v)}</option>)}</select></label><label>{t('Support response')}<textarea aria-label={t('Support response')} rows={4} maxLength={4000} value={reply} onChange={e=>setReply(e.target.value)}/></label><button disabled={busy}>{t('Save changes')}</button></form></details>;}
