// Resize before sending; the server independently decodes and normalises uploads.
export async function prepareImage(file:File,width=1600):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a PNG, JPEG or WebP image up to 5 MB.');
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('Choose a PNG, JPEG or WebP image up to 5 MB.');}
 try{
  const scale=Math.min(1,width/bitmap.width,1200/bitmap.height),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Please try again.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.65,.45]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=500000)return data;}
  throw Error('Choose a smaller image.');
 }finally{bitmap.close();}
}
