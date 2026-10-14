export type FeedbackQuestion={id:string;type:'rating'|'single'|'multiple'|'text';prompt:string;required:boolean;options:string[]};
export type FeedbackTemplate={id?:string;name:string;mode:'anonymous'|'named';shared:boolean;revision?:number;questions:FeedbackQuestion[];locked?:boolean;readOnly?:boolean};
export type FeedbackAnswer=number|number[]|string|null;
export const ratingLabels=['Very poor','Poor','Fair','Good','Excellent'];
export function starterFeedback():FeedbackTemplate{return {name:'Training feedback',mode:'anonymous',shared:false,questions:[
 ...['Overall satisfaction','Relevance to your role','Clarity of the training','Confidence applying the learning'].map((prompt,i)=>({id:crypto.randomUUID(),type:'rating' as const,prompt,required:true,options:i===3?['Not confident','Slightly confident','Somewhat confident','Confident','Very confident']:[...ratingLabels]})),
 {id:crypto.randomUUID(),type:'text',prompt:'Suggested improvements',required:false,options:[]},
]};}
export type FeedbackInvitation={id:string;kind:string;target_id:string;title:string;completion_month:string;version:number;name:string;mode:'anonymous'|'named';questions:FeedbackQuestion[]};
