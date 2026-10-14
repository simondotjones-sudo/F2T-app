import {nativeAuthor} from '@/lib/native-authoring';
import Builder from './builder';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;await nativeAuthor(id);return <Builder courseId={id}/>;}
