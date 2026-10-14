import sharp from 'sharp';
import {CourseError} from './course-admin';
export async function normaliseImage(value:unknown):Promise<string|null>{
 if(value===null||value==='')return null;
 if(typeof value!=='string'||value.length>500000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new CourseError('Choose a PNG, JPEG or WebP image up to 5 MB.');
 try{
  const bytes=Buffer.from(value.slice(value.indexOf(',')+1),'base64');
  const image=sharp(bytes,{limitInputPixels:20000000,failOn:'warning'});
  const metadata=await image.metadata();
  if(!['png','jpeg','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw Error();
  const output=await image.rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80}).toBuffer();
  const result='data:image/jpeg;base64,'+output.toString('base64');if(result.length>500000)throw Error();return result;
 }catch{throw new CourseError('Choose a smaller image.');}
}
