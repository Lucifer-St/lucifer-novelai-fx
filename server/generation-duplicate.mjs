import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {recipeForImage} from './png-metadata.mjs';

const imageEndpoint=endpoint=>['/ai/generate-image','/ai/generate-image-stream'].includes(endpoint);
function stable(value){return Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;}
export function generationFingerprint(payload,endpoint){
 if(!imageEndpoint(endpoint))return null;
 const native=structuredClone(payload?.novelai?.body||payload),seed=native?.parameters?.seed;
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)return null;
 // Stream delivery and JSON/image encoding do not change generation parameters.
 delete native.parameters.stream;
 return createHash('sha256').update(JSON.stringify(stable(native))).digest('hex');
}
export function createGenerationDuplicateGuard({historyDir,resultDir}){
 let last=null,loaded;
 async function initialize(){
  let names;try{names=(await readdir(historyDir)).filter(n=>/^\d+-[a-f0-9]{8}\.json$/.test(n)).sort().reverse();}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const name of names){
   let entry;try{entry=JSON.parse(await readFile(path.join(historyDir,name),'utf8'));}catch{continue;}
   if(entry.status!=='success'||!entry.images?.length)continue;
   if(entry.generationFingerprint){last=entry.generationFingerprint;return;}
   // Upgrade migration reads only the newest successful result's own request.
   const requestName=`${entry.id}-request.json`;
   if(entry.requestUrl!==`/api/results/${requestName}`)return;
   try{const payload=JSON.parse(await readFile(path.join(resultDir,requestName),'utf8'));last={request:generationFingerprint(payload,entry.endpoint||payload?.novelai?.endpoint)};}catch{}
   return;
  }
 }
 const ready=()=>loaded||=(initialize());
 return {ready,async assertAllowed(payload,endpoint){await ready();const fingerprint=generationFingerprint(payload,endpoint);if(fingerprint&&(fingerprint===last?.request||fingerprint===last?.image))throw Object.assign(Error('本次种子、提示词和生成参数与上一笔成功出图完全相同，已阻止重复生成。请更换种子或修改参数后再试。'),{status:409,code:'duplicate_generation',billingUnknown:false});},
  remember(payload,endpoint,images,entry){
   if(!images.length)return;
   const request=generationFingerprint(payload,endpoint);let image=null;
   if(request){const native=recipeForImage(images.at(-1),payload?.novelai?.body||payload,images.length-1);native.parameters.n_samples=1;image=generationFingerprint(native,endpoint);}
   last={request,image};entry.generationFingerprint=last;
  }
 };
}
