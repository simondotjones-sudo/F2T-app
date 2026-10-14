'use client';
import {useState,type ReactNode} from 'react';
import {useBrand} from './branding-provider';
import {useLanguage} from './language-provider';
import {Button} from './ui/button';
import {markAssessment} from '@/lib/course-quiz';
import {practiceQuiz,type NativeBlock} from '@/lib/native-content';
export function RichText({text}:{text:string}){
 const inline=(s:string):ReactNode[]=>s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part,i)=>{
  const link=part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
  if(link)return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
  if(part.startsWith('**')&&part.endsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
  if(part.startsWith('*')&&part.endsWith('*'))return <em key={i}>{part.slice(1,-1)}</em>;
  return part;
 });
 const lines=text.split('\n'),nodes:ReactNode[]=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/^[-*] /.test(line)||/^\d+\. /.test(line)){
   const ordered=/^\d+\. /.test(line),test=ordered?/^\d+\. /:/^[-*] /,items=[];
   while(i<lines.length&&test.test(lines[i])){items.push(<li key={i}>{inline(lines[i].replace(test,''))}</li>);i++;}i--;
   nodes.push(ordered?<ol key={i}>{items}</ol>:<ul key={i}>{items}</ul>);
  }else if(/^#{1,3} /.test(line)){nodes.push(<h3 key={i}>{inline(line.replace(/^#{1,3} /,''))}</h3>);}
  else nodes.push(<p key={i}>{inline(line)}</p>);
 }
 return <div className="native-prose">{nodes}</div>;
}
export type NativeInteraction=(action:string,blockId:string,answers?:number[])=>Promise<{correct?:boolean;explanation?:string}|void>;
function Practice({block,done,onInteract}:{block:Extract<NativeBlock,{type:'knowledge'}>;done:boolean;onInteract:NativeInteraction}){
 const {t}=useLanguage(),[answers,setAnswers]=useState<number[]>([]),[feedback,setFeedback]=useState<{correct?:boolean;explanation?:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <fieldset><legend>{block.question.prompt}</legend><p>{t('Unscored practice')}{block.required?' · '+t('Required'):''}</p>{block.question.options.map((option,i)=><label className="native-choice" key={i}><input type={block.question.type==='multiple'?'checkbox':'radio'} name={block.id} checked={answers.includes(i)} onChange={()=>setAnswers(block.question.type==='multiple'?answers.includes(i)?answers.filter(v=>v!==i):[...answers,i]:[i])}/>{option}</label>)}
 <Button disabled={busy||!answers.length} onClick={async()=>{setBusy(true);setError('');try{setFeedback((await onInteract('practice',block.id,answers))||undefined);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{t('Check answer')}</Button>
 {feedback&&<div role="status"><strong>{t(feedback.correct?'Correct':'Try again')}</strong><p>{feedback.explanation}</p></div>}{done&&<p>{t('Practice recorded')}</p>}{error&&<p role="alert">{t(error)}</p>}</fieldset>;
}
export default function NativeRenderer({blocks,courseId,preview=false,acknowledged=[],practised=[],onInteract,onActivity}:{blocks:NativeBlock[];courseId:string;preview?:boolean;acknowledged?:string[];practised?:string[];onInteract:NativeInteraction;onActivity?:()=>void}){
 const brand=useBrand();
 const {t}=useLanguage(),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const url=(id:string|null)=>`/api/native-media/${id}?courseId=${encodeURIComponent(courseId)}${preview?'&preview=1':''}&client=${encodeURIComponent(brand.slug)}`;
 return <div className="native-blocks">{blocks.map(b=><section className="native-block" key={b.id}>
 {b.type==='text'&&<RichText text={b.text}/>}
 {b.type==='image'&&b.mediaId&&<figure><img src={url(b.mediaId)} alt={b.decorative?'':b.alt}/>{b.caption&&<figcaption>{b.caption}</figcaption>}</figure>}
 {b.type==='video'&&<>{b.mediaId&&<video onTimeUpdate={e=>{if(!e.currentTarget.paused)onActivity?.();}} controls preload="metadata" src={url(b.mediaId)}/>}<details><summary>{t('Transcript')}</summary><RichText text={b.transcript}/></details></>}
 {b.type==='document'&&b.mediaId&&<a href={url(b.mediaId)} target="_blank" rel="noopener noreferrer">{b.label||t('Download')}</a>}
 {b.type==='accordion'&&b.items.map((item,i)=><details key={i}><summary>{item.title}</summary><RichText text={item.text}/></details>)}
 {b.type==='process'&&<ol className="native-process">{b.items.map((item,i)=><li key={i}><h3>{item.title}</h3><RichText text={item.text}/></li>)}</ol>}
 {b.type==='acknowledgement'&&<><label className="native-choice"><input type="checkbox" checked={acknowledged.includes(b.id)} disabled={!!busy||acknowledged.includes(b.id)} onChange={async()=>{setBusy(b.id);setError('');try{await onInteract('acknowledge',b.id);}catch(e){setError((e as Error).message);}finally{setBusy('');}}}/><span>{b.statement}{b.required&&<small> · {t('Required')}</small>}</span></label>{busy===b.id&&<p role="status">{t('Saving…')}</p>}{error&&<p role="alert">{t(error)}</p>}</>}
 {b.type==='knowledge'&&<Practice block={b} done={practised.includes(b.id)} onInteract={onInteract}/>}
 </section>)}</div>;
}
export function previewPractice(block:NativeBlock,answers:number[]){if(block.type!=='knowledge')return;return {correct:markAssessment(practiceQuiz(block.question),[answers]).passed,explanation:block.question.explanation};}
