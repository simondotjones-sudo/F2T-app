export type QuizQuestion={prompt:string;options:string[];correctIndex:number;type?:'single'|'multiple'|'boolean';correctIndices?:number[];explanation?:string;id?:string;category?:string;bankId?:string};
export type CourseQuiz={passPercent:number;questions:QuizQuestion[];advanced?:AssessmentOptions};
export type AssessmentOptions={mode:'fixed'|'random';count:number;bankIds:string[];categories:string[];shuffleQuestions:boolean;shuffleAnswers:boolean;maxAttempts:number|null;retryMinutes:number;review:'each'|'pass'|'never'};
export function validateQuiz(value:unknown):CourseQuiz|null{
 if(value===null)return null;
 const q=value as CourseQuiz;
 if(!q||!Number.isInteger(q.passPercent)||q.passPercent<1||q.passPercent>100||!Array.isArray(q.questions)||q.questions.length<1||q.questions.length>(q.advanced?500:50))throw new Error('Add 1–50 questions and a pass mark from 1 to 100%.');
 const advanced=q.advanced?validateAssessmentOptions(q.advanced):undefined;
 return {passPercent:q.passPercent,...(advanced?{advanced}:{}),questions:q.questions.map(item=>{
  if(!item||typeof item.prompt!=='string'||!item.prompt.trim()||item.prompt.length>1000||!Array.isArray(item.options)||item.options.length<2||item.options.length>6||item.options.some(v=>typeof v!=='string'||!v.trim()||v.length>500)||!Number.isInteger(item.correctIndex)||item.correctIndex<0||item.correctIndex>=item.options.length)throw new Error('Each question needs 2–6 answers and one correct answer.');
  const type=item.type??'single';
  if(!advanced&&(type!=='single'||item.explanation))throw new Error('Enable advanced assessments for these question options.');
  if(!['single','multiple','boolean'].includes(type))throw new Error('Choose a valid question type.');
  if(type==='boolean'&&(item.options.length!==2||item.options[0]!=='True'||item.options[1]!=='False'))throw new Error('True/false questions need True and False answers.');
  const indices=type==='multiple'?item.correctIndices:[item.correctIndex];
  if(!Array.isArray(indices)||!indices.length||new Set(indices).size!==indices.length||indices.some(n=>!Number.isInteger(n)||n<0||n>=item.options.length))throw new Error('Choose the correct answers.');
  if(item.explanation!==undefined&&(typeof item.explanation!=='string'||item.explanation.length>2000))throw new Error('Keep explanations within 2,000 characters.');
  if(item.category!==undefined&&(typeof item.category!=='string'||item.category.length>80))throw new Error('Keep categories within 80 characters.');
  return {prompt:item.prompt.trim(),options:item.options.map(v=>v.trim()),correctIndex:item.correctIndex,
   ...(item.type?{type,correctIndices:indices}:{}),...(item.explanation?{explanation:item.explanation.trim()}:{}),
   ...(item.id?{id:String(item.id).slice(0,80)}:{}),...(item.bankId?{bankId:String(item.bankId).slice(0,80)}:{}),...(item.category?{category:item.category.trim()}: {})};
 })};
}
export function markQuiz(quiz:CourseQuiz,answers:unknown){
 if(!Array.isArray(answers)||answers.length!==quiz.questions.length||answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=quiz.questions[i].options.length))throw new Error('Answer every question before submitting.');
 const correct=answers.filter((a,i)=>a===quiz.questions[i].correctIndex).length;
 return {correct,total:answers.length,passPercent:quiz.passPercent,passed:correct*100>=quiz.passPercent*answers.length};
}

export function validateAssessmentOptions(a:AssessmentOptions):AssessmentOptions{
 if(!a||!['fixed','random'].includes(a.mode)||!Number.isInteger(a.count)||a.count<1||a.count>50||
 !Array.isArray(a.bankIds)||a.bankIds.length>50||a.bankIds.some(v=>typeof v!=='string'||v.length>80)||
 !Array.isArray(a.categories)||a.categories.length>100||a.categories.some(v=>typeof v!=='string'||v.length>80)||
 typeof a.shuffleQuestions!=='boolean'||typeof a.shuffleAnswers!=='boolean'||
 (a.maxAttempts!==null&&(!Number.isInteger(a.maxAttempts)||a.maxAttempts<1||a.maxAttempts>100))||
 !Number.isInteger(a.retryMinutes)||a.retryMinutes<0||a.retryMinutes>525600||!['each','pass','never'].includes(a.review))throw new Error('Check the assessment settings.');
 return {mode:a.mode,count:a.count,bankIds:[...new Set(a.bankIds)],categories:[...new Set(a.categories)],shuffleQuestions:a.shuffleQuestions,shuffleAnswers:a.shuffleAnswers,maxAttempts:a.maxAttempts,retryMinutes:a.retryMinutes,review:a.review};
}
export function markAssessment(quiz:CourseQuiz,answers:unknown){
 if(!Array.isArray(answers)||answers.length!==quiz.questions.length)throw new Error('Answer every question before submitting.');
 let correct=0;
 quiz.questions.forEach((q,i)=>{
  const picked=Array.isArray(answers[i])?answers[i]:[answers[i]];
  if(!picked.length||new Set(picked).size!==picked.length||picked.some((n:unknown)=>!Number.isInteger(n)||Number(n)<0||Number(n)>=q.options.length)||(q.type!=='multiple'&&picked.length!==1))throw new Error('Answer every question before submitting.');
  const key=q.type==='multiple'?q.correctIndices!:[q.correctIndex];
  if(picked.length===key.length&&picked.every((n:number)=>key.includes(n)))correct++;
 });
 return {correct,total:answers.length,passPercent:quiz.passPercent,passed:correct*100>=quiz.passPercent*answers.length};
}
// Call on the server with a cryptographically secure integer generator.
export function selectAssessment(quiz:CourseQuiz,randomInt:(max:number)=>number):CourseQuiz{
 const shuffle=<T,>(items:T[])=>{for(let i=items.length-1;i>0;i--){const j=randomInt(i+1);[items[i],items[j]]=[items[j],items[i]];}return items;};
 const a=quiz.advanced!;let questions=structuredClone(quiz.questions);
 if(a.mode==='random'){
  if(questions.length<a.count)throw new Error('Not enough eligible questions.');
  const selected=shuffle(questions.map((_,i)=>i)).slice(0,a.count);
  if(!a.shuffleQuestions)selected.sort((x,y)=>x-y);
  questions=selected.map(i=>questions[i]);
 }else if(a.shuffleQuestions)questions=shuffle(questions);
 if(a.shuffleAnswers)questions=questions.map(q=>{
  const order=shuffle(q.options.map((_,i)=>i));
  return {...q,options:order.map(i=>q.options[i]),correctIndex:order.indexOf(q.correctIndex),...(q.correctIndices?{correctIndices:q.correctIndices.map(i=>order.indexOf(i))}:{})};
 });
 return {...structuredClone(quiz),questions};
}
export function publicAssessment(quiz:CourseQuiz){return quiz.questions.map(q=>({prompt:q.prompt,options:q.options,type:q.type??'single'}));}
export function assessmentReview(quiz:CourseQuiz,passed:boolean){
 const allowed=quiz.advanced?.review==='each'||(quiz.advanced?.review==='pass'&&passed);
 // Explanations can reveal answers, so they follow the same release policy.
 return allowed?quiz.questions.map(q=>({prompt:q.prompt,options:q.options,correctIndices:q.type==='multiple'?q.correctIndices:[q.correctIndex],explanation:q.explanation??''})):[];
}
