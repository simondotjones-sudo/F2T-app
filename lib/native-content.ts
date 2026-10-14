import {z} from 'zod';
import {validateQuiz,type QuizQuestion} from './course-quiz';
const id=z.string().uuid();
const text=z.string().max(20000);
const item=z.object({title:z.string().max(200),text});
const base={id};
// Rich text is a small Markdown subset rendered as React nodes, never injected HTML.
export const blockSchema=z.discriminatedUnion('type',[
 z.object({...base,type:z.literal('text'),text}),
 z.object({...base,type:z.literal('image'),mediaId:id.nullable(),caption:z.string().max(1000),alt:z.string().max(500),decorative:z.boolean()}),
 z.object({...base,type:z.literal('video'),mediaId:id.nullable(),transcript:text}),
 z.object({...base,type:z.literal('document'),mediaId:id.nullable(),label:z.string().max(200)}),
 z.object({...base,type:z.literal('accordion'),items:z.array(item).min(1).max(30)}),
 z.object({...base,type:z.literal('process'),items:z.array(item).min(1).max(30)}),
 z.object({...base,type:z.literal('acknowledgement'),statement:text,required:z.boolean()}),
 z.object({...base,type:z.literal('knowledge'),required:z.boolean(),question:z.object({id:z.string().optional(),prompt:z.string().max(1000),options:z.array(z.string().max(500)).min(2).max(6),correctIndex:z.number().int().min(0).max(5),type:z.enum(['single','multiple','boolean']),correctIndices:z.array(z.number().int()).optional(),explanation:z.string().max(2000).optional(),category:z.string().max(80).optional()})})
]);
const provenance=z.object({sourceDocumentIds:z.array(z.string().max(100)).max(100).optional(),references:z.array(z.string().url().max(2000)).max(100).optional(),generation:z.object({provider:z.string().max(80),model:z.string().max(100),generatedAt:z.string().datetime()}).optional(),reviewState:z.enum(['draft','reviewed']).optional()});
export const contentSchema=z.object({schemaVersion:z.literal(1),metadata:provenance.optional(),sequential:z.boolean(),lessons:z.array(z.object({id,title:z.string().max(200),required:z.boolean(),blocks:z.array(blockSchema).max(100)})).max(100)});
export type NativeContent=z.infer<typeof contentSchema>;
export type NativeBlock=z.infer<typeof blockSchema>;
export const practiceQuiz=(question:QuizQuestion)=>({passPercent:100,questions:[question],advanced:{mode:'fixed' as const,count:1,bankIds:[],categories:[],shuffleQuestions:false,shuffleAnswers:false,maxAttempts:null,retryMinutes:0,review:'each' as const}});
export function validateContent(value:unknown,publish=false):NativeContent {
 const parsed=contentSchema.safeParse(value);
 if(!parsed.success)throw new Error('Check the course content structure.');
 const c=parsed.data,ids=c.lessons.flatMap(l=>[l.id,...l.blocks.map(b=>b.id)]);
 if(new Set(ids).size!==ids.length)throw new Error('Lesson and block identifiers must be unique.');
 if(JSON.stringify(c).length>800000)throw new Error('Course content is too large.');
 if(publish){
  if(!c.lessons.length||!c.lessons.some(l=>l.required))throw new Error('Add at least one required lesson.');
  for(const l of c.lessons){
   if(!l.title.trim()||!l.blocks.length)throw new Error('Every lesson needs a title and content.');
   for(const b of l.blocks){
    if(b.type==='text'&&!b.text.trim()||b.type==='acknowledgement'&&!b.statement.trim())throw new Error('Complete empty text blocks before publishing.');
    if('mediaId' in b&&!b.mediaId)throw new Error('Choose a file for every media block.');
    if(b.type==='image'&&!b.decorative&&!b.alt.trim())throw new Error('Add alternative text or mark the image decorative.');
    if(b.type==='video'&&!b.transcript.trim())throw new Error('Add a transcript for each video.');
    if(b.type==='document'&&!b.label.trim())throw new Error('Name each document.');
    if('items' in b&&b.items.some(i=>!i.title.trim()||!i.text.trim()))throw new Error('Complete each section title and text.');
    if(b.type==='knowledge')validateQuiz(practiceQuiz(b.question));
   }
  }
 }
 return c;
}
export const mediaIds=(c:NativeContent)=>[...new Set(c.lessons.flatMap(l=>l.blocks.flatMap(b=>'mediaId' in b&&b.mediaId?[b.mediaId]:[])))];
export function emptyBlock(type:NativeBlock['type']):NativeBlock {
 const key=crypto.randomUUID();
 switch(type){
  case 'text':return {id:key,type,text:''};
  case 'image':return {id:key,type,mediaId:null,caption:'',alt:'',decorative:false};
  case 'video':return {id:key,type,mediaId:null,transcript:''};
  case 'document':return {id:key,type,mediaId:null,label:''};
  case 'accordion':case 'process':return {id:key,type,items:[{title:'',text:''}]};
  case 'acknowledgement':return {id:key,type,statement:'',required:true};
  case 'knowledge':return {id:key,type,required:true,question:{prompt:'',type:'single',options:['',''],correctIndex:0,explanation:''}};
 }
}
