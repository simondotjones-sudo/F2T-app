import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {validLogo,type ClientBrand} from './tenant-types';
export async function renderPwaIcon(brand:ClientBrand,size:number){
 if(![180,192,512].includes(size))throw new Error('Invalid icon size');
 if(!validLogo(brand.logo_url))throw new Error('Invalid client logo');
 // Use the compact Fit2Trade mark for app icons; keep the full wordmark in page headers.
 const logoUrl=brand.logo_url==='/branding/fit2trade-logo.svg'?'/branding/fit2trade-icon.svg':brand.logo_url;
 const source=logoUrl.startsWith('data:')?Buffer.from(logoUrl.split(',')[1],'base64'):await readFile(path.join(process.cwd(),'public',logoUrl));
 // Keep the complete logo inside the maskable icon's central safe circle.
 const inset=Math.floor(size*.54);
 const logo=await sharp(source,{limitInputPixels:16777216}).resize(inset,inset,{fit:'inside'}).png().toBuffer();
 return sharp({create:{width:size,height:size,channels:4,background:'#ffffff'}}).composite([{input:logo,gravity:'centre'}]).png().toBuffer();
}
