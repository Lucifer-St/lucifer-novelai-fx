import {GLOSSARY_EVENT,GLOSSARY_KEY,readPersonalGlossary} from './tag-glossary.mjs';
let worker,sequence=0;
const waiting=new Map();
function refreshGlossary(){worker?.postMessage({type:'glossary',terms:readPersonalGlossary()});}
globalThis.addEventListener?.(GLOSSARY_EVENT,refreshGlossary);
globalThis.addEventListener?.('storage',event=>{if(event.key===GLOSSARY_KEY)refreshGlossary();});
function getWorker(){
  if(!worker){worker=new Worker(new URL('./tag-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{const handler=waiting.get(data.id);if(!handler)return;waiting.delete(data.id);data.error?handler.reject(Error(data.error)):handler.resolve(data.tags);};
    worker.onerror=()=>{for(const handler of waiting.values())handler.reject(Error('本地词表无法启动'));waiting.clear();worker?.terminate();worker=null;};
    refreshGlossary();
  }return worker;
}
export function localSuggestions(query,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(new DOMException('Aborted','AbortError'));
  const id=++sequence,abort=()=>{waiting.delete(id);reject(new DOMException('Aborted','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  const finish=fn=>v=>{signal.removeEventListener('abort',abort);fn(v);};
  waiting.set(id,{resolve:finish(resolve),reject:finish(reject)});
  try{getWorker().postMessage({id,query});}catch(e){waiting.delete(id);signal.removeEventListener('abort',abort);reject(e);}
});}
export async function officialSuggestions(){
  // Retained as a fail-closed compatibility export. No timer, fetch or fallback.
  throw Error('分享版仅提供本地词库补全。');
}
