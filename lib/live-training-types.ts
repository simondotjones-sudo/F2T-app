export type LiveTraining={id:string;title:string;description:string;trainer:string;award_certificate:boolean;validity_months:number|null;revision:number};
export type LiveSession={id:string;training_id:string;title:string;trainer:string;starts_at:string;ends_at:string;time_zone:string;format:'webinar'|'classroom';location:string;status:'scheduled'|'cancelled';revision:number};
export type LiveRecord={id:string;session_id:string;learner_id:string;name:string;store_id:string;country:string;title:string;description:string;trainer:string;starts_at:string;ends_at:string;time_zone:string;format:string;location:string;session_status:string;attendance:'assigned'|'attended'|'absent'|'cancelled';revision:number;certificate_token:string|null;expires_at:string|null;can_join?:boolean};
export function liveStatus(r:LiveRecord){return r.attendance==='attended'?'Completed':r.attendance==='cancelled'||r.session_status==='cancelled'?'Cancelled':r.attendance==='absent'?'Missed':Date.parse(r.ends_at)<Date.now()?'Awaiting attendance':'Upcoming';}
// Resolve local wall time against IANA timezone offsets. Reject nonexistent and ambiguous DST times.
export function liveInstant(value:unknown,zone:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)||typeof zone!=='string')throw new Error('Check the session dates and timezone.');
 const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=(date:Date)=>{const p=Object.fromEntries(f.formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
 const wall=Date.parse(value+'Z');if(!Number.isFinite(wall))throw new Error('Check the session dates and timezone.');
 const offsets=new Set<number>();for(const delta of [-36,0,36]){const d=new Date(wall+delta*3600000);offsets.add(Date.parse(local(d)+'Z')-d.getTime());}
 const matches=[...offsets].map(offset=>new Date(wall-offset)).filter(d=>local(d)===value);
 if(matches.length!==1)throw new Error('Check the session dates and timezone.');return matches[0].toISOString();
}
