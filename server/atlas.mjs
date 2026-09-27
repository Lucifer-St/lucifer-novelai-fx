import {publicNetworkMessage} from './public-network-errors.mjs';
const ORIGIN='https://novelai.quicktagcloud.com';
const HOSTS=new Set(['novelai.quicktagcloud.com','assets.quicktagcloud.com']);
// Community packs exceed 8 MiB (V5 ~9.4 MB, V4.5 ~15.5 MB). This limit
// applies only to allowlisted public JSON, not HTML, storage or image imports.
export const ATLAS_RESOURCE_MAX_BYTES=32*1024*1024;
async function atlasFetch(url,options,fetchImpl){
 try{return await fetchImpl(url,{...options,method:'GET',credentials:'omit'});}
 catch(error){throw Error(publicNetworkMessage(error,'法典图鉴'),{cause:error});}
}
export function validateAtlasImage(value){
 let url;try{url=new URL(value);}catch{throw Error('图鉴原图地址无效。');}
 if(url.protocol!=='https:'||url.port||url.username||url.password||!HOSTS.has(url.hostname)||!/^\/(?:[^/]+\/)*[^/]+\.(?:png|jpe?g|webp)$/i.test(url.pathname)||/%(?:2f|5c|00)/i.test(url.pathname))throw Error('只支持法典图鉴公开的 PNG、JPEG 或 WebP 原图。');
 return url.href;
}
async function bounded(response,max){
 if(!response.ok)throw Error(`图鉴读取失败（HTTP ${response.status}）。`);
 if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw Error('图鉴文件超过大小上限。');}
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('图鉴文件超过大小上限。');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);
}
export function validateAtlasResource(value){
 let url;try{url=new URL(value);}catch{throw Error('图鉴数据地址无效。');}
 if(url.protocol!=='https:'||url.port||url.username||url.password||!HOSTS.has(url.hostname)||!/^\/(?:data-source\.json|data\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.json)$/.test(url.pathname)||url.search||url.hash)throw Error('不支持的图鉴数据地址。');return url.href;
}
export async function atlasResource(value,{fetchImpl=fetch}={}){
 const url=validateAtlasResource(value),response=await atlasFetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json','User-Agent':'Lucifer-NovelAI-FX/Atlas-integration'}},fetchImpl);
 const bytes=await bounded(response,ATLAS_RESOURCE_MAX_BYTES);JSON.parse(bytes.toString('utf8'));return bytes;
}
export async function atlasDocumentSource(fetchImpl=fetch){
 const response=await atlasFetch(ORIGIN+'/?c=artist_nai5_personal',{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'text/html','User-Agent':'Lucifer-NovelAI-FX/Atlas-integration'}},fetchImpl);
 if(!response.headers.get('content-type')?.includes('text/html'))throw Error('图鉴返回了无效页面。');
 return {html:(await bounded(response,2*1024*1024)).toString('utf8')};
}
export async function atlasOriginal(value,{fetchImpl=fetch,signal}={}){
 const url=validateAtlasImage(value),response=await atlasFetch(url,{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),headers:{Accept:'image/png,image/jpeg,image/webp',Referer:ORIGIN+'/','User-Agent':'Lucifer-NovelAI-FX/Atlas-import'}},fetchImpl);
 const bytes=await bounded(response,32*1024*1024);
 const contentType=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!contentType)throw Error('图鉴返回的文件不是有效图片。');return {bytes,contentType};
}
