import type {SiteImportRow} from './site-import';
export function parseSiteCsv(source:string):SiteImportRow[]{
 if(source.length>500000)throw Error('This request is too large.');
 const rows:string[][]=[];let row:string[]=[],value='',quoted=false,closed=false;
 const cell=()=>{row.push(value);value='';closed=false;},line=()=>{cell();if(row.some(v=>v.trim()))rows.push(row);row=[];};
 source=source.replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){const c=source[i];if(quoted){if(c==='"'){if(source[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}if(c===','){cell();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;line();continue;}if(closed)throw Error('Invalid CSV quoting.');if(c==='"'){if(value)throw Error('Invalid CSV quoting.');quoted=true;}else value+=c;}
 if(quoted)throw Error('Invalid CSV quoting.');if(value||row.length||closed)line();
 const headers=rows.shift()?.map(v=>v.trim().toLowerCase())||[],required=['name','country','store_code'];
 if(required.some(v=>!headers.includes(v))||new Set(headers).size!==headers.length||headers.some(v=>![...required,'group_1','group_2','group_3','group_4'].includes(v)))throw Error('Use the site import template column headings.');
 const groupHeaders=['group_1','group_2','group_3','group_4'];
 const lastGroup=groupHeaders.findLastIndex(h=>headers.includes(h));
 return rows.map(values=>{if(values.length!==headers.length)throw Error('Every CSV row must have the same number of columns.');const r=Object.fromEntries(headers.map((h,i)=>[h,values[i].trim()]));return {name:r.name,country:r.country,code:r.store_code,groups:groupHeaders.slice(0,lastGroup+1).map(h=>r[h]||'')};});
}
