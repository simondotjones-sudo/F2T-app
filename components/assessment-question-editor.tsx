'use client';
import type {QuizQuestion} from '@/lib/course-quiz';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {useLanguage} from '@/components/language-provider';
export const emptyQuestion=():QuizQuestion=>({id:crypto.randomUUID(),prompt:'',options:['',''],correctIndex:0,type:'single',category:''});
export default function AssessmentQuestionEditor({questions,onChange,single=false}:{questions:QuizQuestion[];onChange:(q:QuizQuestion[])=>void;single?:boolean}){
 const {t}=useLanguage();const change=(i:number,v:Partial<QuizQuestion>)=>onChange(questions.map((q,j)=>i===j?{...q,...v}:q));
 return <>{questions.map((q,i)=><fieldset className="quiz-question" key={q.id||i}><legend>{t('Question')} {i+1}</legend>
 <label>{t('Question type')}<NativeSelect value={q.type||'single'} onChange={e=>change(i,{type:e.target.value as QuizQuestion['type'],correctIndex:0,correctIndices:[0],options:e.target.value==='boolean'?['True','False']:['','']})}><option value="single">{t('Single answer')}</option><option value="multiple">{t('Multiple answers')}</option><option value="boolean">{t('True/false')}</option></NativeSelect></label>
 <label>{t('Category')}<Input maxLength={80} value={q.category||''} onChange={e=>change(i,{category:e.target.value})}/></label>
 <label>{t('Question text')}<textarea required maxLength={1000} value={q.prompt} onChange={e=>change(i,{prompt:e.target.value})}/></label>
 {q.options.map((option,j)=><label key={j}>{t('Answer')} {j+1}<Input required maxLength={500} disabled={q.type==='boolean'} value={q.type==='boolean'?t(option):option} onChange={e=>change(i,{options:q.options.map((v,k)=>j===k?e.target.value:v)})}/>
 <span><input type={q.type==='multiple'?'checkbox':'radio'} name={'correct-'+(q.id||i)} checked={q.type==='multiple'?(q.correctIndices||[]).includes(j):q.correctIndex===j} onChange={e=>change(i,q.type==='multiple'?{correctIndices:e.target.checked?[...(q.correctIndices||[]),j]:(q.correctIndices||[]).filter(k=>k!==j)}:{correctIndex:j})}/>{t('Correct answer')}</span></label>)}
 <label>{t('Explanation')}<textarea maxLength={2000} value={q.explanation||''} onChange={e=>change(i,{explanation:e.target.value})}/></label>
 <div className="editor-actions"><Button type="button" variant="outline" disabled={q.type==='boolean'||q.options.length>=6} onClick={()=>change(i,{options:[...q.options,'']})}>{t('Add answer')}</Button><Button type="button" variant="outline" disabled={q.type==='boolean'||q.options.length<=2} onClick={()=>change(i,{options:q.options.slice(0,-1),correctIndex:Math.min(q.correctIndex,q.options.length-2),correctIndices:q.correctIndices?.filter(n=>n<q.options.length-1)})}>{t('Remove last answer')}</Button><Button type="button" variant="outline" disabled={questions.length<=1} onClick={()=>onChange(questions.filter((_,j)=>i!==j))}>{t('Remove question')}</Button></div>
 </fieldset>)}{!single&&<Button type="button" variant="outline" disabled={questions.length>=500} onClick={()=>onChange([...questions,emptyQuestion()])}>{t('Add question')}</Button>}</>;
}
