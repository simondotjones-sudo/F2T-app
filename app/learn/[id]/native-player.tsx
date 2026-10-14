'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/components/language-provider';
import NativeRenderer,{previewPractice} from '@/components/native-renderer';
import type {NativeContent} from '@/lib/native-content';
import '@/components/native-course.css';
type State={completed:string[];acknowledged:string[];practised:string[];lessonId?:string;contentComplete?:boolean};
const emptyState:State={completed:[],acknowledged:[],practised:[]};
export default function NativePlayer({courseId,preview}:{courseId:string;preview:boolean}){
 const {t}=useLanguage(),[data,setData]=useState<{content:NativeContent;title:string;quizRequired:boolean}|null>(null),[state,setState]=useState<State>(emptyState),[lessonId,setLessonId]=useState(''),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef(Date.now()),current=useRef({lessonId,token});current.current={lessonId,token};
 async function post(action:string,extra:Record<string,unknown>={}){const r=await fetch('/api/native-content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId,token:current.current.token,lessonId:current.current.lessonId,action,...extra})}),d=await r.json();if(!r.ok)throw new Error(d.error);setState(s=>({...d.state,completed:[...new Set([...s.completed,...d.state.completed])],acknowledged:[...new Set([...s.acknowledged,...d.state.acknowledged])],practised:[...new Set([...s.practised,...d.state.practised])],contentComplete:s.contentComplete||d.state.contentComplete}));if(d.token)setToken(d.token);return d;}
 useEffect(()=>{let cancelled=false;fetch(`/api/native-content?courseId=${courseId}${preview?'&preview=1':''}`,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(cancelled)return;setState(d.state||emptyState);const id=d.state?.lessonId||d.content.lessons[0]?.id||'';setLessonId(id);if(!preview){const result=await post('launch',{lessonId:id});await post('visit',{lessonId:id,token:result.token});}setData(d);}).catch(e=>setError(e.message));return()=>{cancelled=true;};},[courseId,preview]);
 useEffect(()=>{
  if(preview)return;
  const touch=()=>{active.current=Date.now();};window.addEventListener('pointerdown',touch);window.addEventListener('keydown',touch);window.addEventListener('scroll',touch,true);
  const interval=setInterval(()=>{if(current.current.token&&document.visibilityState==='visible'&&Date.now()-active.current<60000)post('heartbeat').catch(e=>setError(e.message));},20000);
  return()=>{clearInterval(interval);window.removeEventListener('pointerdown',touch);window.removeEventListener('keydown',touch);window.removeEventListener('scroll',touch,true);};
 },[preview]);
 const lesson=data?.content.lessons.find(l=>l.id===lessonId),content=data?.content;
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const complete=()=>run(async()=>{if(preview)setState(s=>({...s,completed:[...new Set([...s.completed,lessonId])]}));else await post('complete');});
 const canComplete=lesson?.blocks.every(b=>b.type==='acknowledgement'&&b.required?state.acknowledged.includes(b.id):b.type==='knowledge'&&b.required?state.practised.includes(b.id):true);
 return <main className="native-shell"><header className="native-toolbar"><a href={preview?`/admin/courses/${courseId}/builder`:'/?courses=1'}>{t(preview?'Back':'My Courses')}</a><h1>{data?.title||t('Loading…')}</h1>{preview&&<span>{t('Preview — progress is not recorded')}</span>}</header>
 {error&&<div role="alert" className="native-error">{t(error)} <Button onClick={()=>location.reload()}>{t('Reload')}</Button></div>}
 {content&&<><progress className="native-course-progress" aria-label={t('Progress')} max={content.lessons.filter(l=>l.required).length||1} value={content.lessons.filter(l=>l.required&&state.completed.includes(l.id)).length}/><div className="native-layout"><details open className="native-outline"><summary>{t('Lessons')}</summary><nav>{content.lessons.map((l,i)=><button key={l.id} aria-current={l.id===lessonId} disabled={busy||content.sequential&&content.lessons.slice(0,i).some(prev=>prev.required&&!state.completed.includes(prev.id))} onClick={()=>run(async()=>{if(!preview)await post('visit',{lessonId:l.id});setLessonId(l.id);})}>{state.completed.includes(l.id)?'✓ ':''}{l.title}{!l.required?' · '+t('Optional'):''}</button>)}</nav></details>
 <article className="native-canvas">{lesson?<><h2>{lesson.title}</h2><NativeRenderer onActivity={()=>{active.current=Date.now();}} key={lesson.id} blocks={lesson.blocks} courseId={courseId} preview={preview} acknowledged={state.acknowledged} practised={state.practised} onInteract={async(action,blockId,answers)=>{
 if(preview){setState(s=>({...s,acknowledged:action==='acknowledge'?[...s.acknowledged,blockId]:s.acknowledged,practised:action==='practice'?[...s.practised,blockId]:s.practised}));return previewPractice(lesson.blocks.find(b=>b.id===blockId)!,answers||[]);}
 const d=await post(action,{blockId,answers,confirmed:true});return d.feedback;
 }}/><div className="native-actions"><Button disabled={busy||!canComplete||state.completed.includes(lesson.id)} onClick={complete}>{t(state.completed.includes(lesson.id)?'Completed':'Complete lesson')}</Button></div>{state.contentComplete&&<div role="status"><p>{t('Course content complete')}</p><a href={data.quizRequired?`/learn/${courseId}/quiz`:'/?courses=1'}>{t(data.quizRequired?'Assessment':'My Courses')}</a></div>}</>:<p>{t('No lessons yet')}</p>}</article></div></>}
 </main>;
}
