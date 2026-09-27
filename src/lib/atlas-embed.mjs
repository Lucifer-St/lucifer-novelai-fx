export const ATLAS_URL='https://novelai.quicktagcloud.com/?c=artist_nai5_personal';
export const ATLAS_ORIGIN=new URL(ATLAS_URL).origin;
// Remote code runs in an opaque sandbox, with no FX cookies, DOM or API access.
export function atlasParts(){
 const bootstrap=`<base href="${ATLAS_ORIGIN}/"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://novelai.quicktagcloud.com; style-src 'unsafe-inline' https://novelai.quicktagcloud.com; img-src data: blob: https://novelai.quicktagcloud.com https://assets.quicktagcloud.com; connect-src https://novelai.quicktagcloud.com https://assets.quicktagcloud.com; font-src https://novelai.quicktagcloud.com; media-src https://assets.quicktagcloud.com; object-src 'none'; frame-src 'none'; form-action 'none'">
<script>
(()=>{
 const saved=__LUCIFER_ATLAS_STORAGE__,localValues=new Map(Object.entries(saved));
 const change=operation=>parent.postMessage({type:'lucifer-atlas-storage-change',operation},'*');
 for(const name of ['localStorage','sessionStorage']){const values=name==='localStorage'?localValues:new Map(),persistent=name==='localStorage';const storage={getItem:k=>values.get(String(k))??null,setItem:(k,v)=>{k=String(k);v=String(v);if(values.get(k)===v)return;values.set(k,v);if(persistent)change({action:'set',key:k,value:v});},removeItem:k=>{k=String(k);if(values.delete(k)&&persistent)change({action:'remove',key:k});},clear:()=>{values.clear();if(persistent)change({action:'clear'});},key:i=>[...values.keys()][i]??null,get length(){return values.size}};Object.defineProperty(window,name,{value:storage});}
 addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='lucifer-atlas-storage-snapshot-request')parent.postMessage({type:'lucifer-atlas-storage-snapshot',id:event.data.id,items:Object.fromEntries(localValues)},event.origin);});
 const originalFetch=window.fetch.bind(window),requests=new Map();
 addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='lucifer-atlas-resource-result')return;const task=requests.get(event.data.id);if(!task)return;requests.delete(event.data.id);clearTimeout(task.timer);event.data.error?task.reject(Error(event.data.error)):task.resolve(new Response(event.data.bytes,{headers:{'Content-Type':'application/json'}}));});
 const relay=url=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{requests.delete(id);reject(Error('图鉴数据读取超时'));},30000);requests.set(id,{resolve,reject,timer});parent.postMessage({type:'lucifer-atlas-resource-request',id,url},'*');});
 window.fetch=async(url,options={})=>{let target=typeof url==='string'?new URL(url,document.baseURI).href:url;
 const dataURL=typeof target==='string'?new URL(target):null;
 const response=dataURL&&['novelai.quicktagcloud.com','assets.quicktagcloud.com'].includes(dataURL.hostname)&&(dataURL.pathname.startsWith('/data/')||dataURL.pathname==='/data-source.json')?await relay(target):await originalFetch(target,{...options,credentials:'omit'});
 if(typeof target==='string'&&target.endsWith('/media.json')&&response.ok){const media=await response.json();return new Response(JSON.stringify({...media,localFallback:false}),{headers:{'Content-Type':'application/json'}});}return response;};
 for(const method of ['pushState','replaceState']){const native=history[method].bind(history);history[method]=(state,title)=>{try{native(state,title)}catch{}};}
})();
</script>`;
 const bridge=`<script type="module">
import {state} from '${ATLAS_ORIGIN}/assets/app/state.js';
import {imageItemUrl} from '${ATLAS_ORIGIN}/assets/app/media.js';
import {entryImageCanUseOriginal} from '${ATLAS_ORIGIN}/assets/app/original-capability.js';
addEventListener('message',event=>{
 if(event.source!==parent||event.data?.type!=='lucifer-atlas-import-request'||typeof event.data.id!=='string')return;
 const reply={type:'lucifer-atlas-import-result',id:event.data.id};
 try{const box=state.lightbox,entry=box?.entry,item=box?.images?.[box.index];
 if(!entry||!item||!document.documentElement.classList.contains('lightbox-open'))throw Error('请先在图鉴里点开一张例图，再点击导入当前原图。');
 if(!entryImageCanUseOriginal(entry,item))throw Error('这张例图未提供原图，无法读取完整生成参数。');
 reply.url=new URL(imageItemUrl('original',entry,item),document.baseURI).href;
 }catch(e){reply.error=e.message;}
 parent.postMessage(reply,event.origin);
});
parent.postMessage({type:'lucifer-atlas-ready'},'*');
</script>`;
 return {bootstrap,bridge};
}
export function atlasDocument(html,items={}){
 const parts=atlasParts(),bootstrap=parts.bootstrap.replace('__LUCIFER_ATLAS_STORAGE__',()=>JSON.stringify(items).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')),bridge=parts.bridge;
 let value=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.includes('cloudflareinsights')||tag.includes('window.__atlasBoot')?'':tag);
 value=value.replace(/@font-face\s*\{[^}]*\}/gi,'');
 value=value.replace(/<base\b[^>]*>/gi,'').replace(/<link\b[^>]*rel=["']manifest["'][^>]*>/gi,'');
 value=value.replace(/(src|href)=(['"])\/(?!\/)/g,`$1=$2${ATLAS_ORIGIN}/`);
 return value.replace(/<head[^>]*>/i,match=>match+bootstrap).replace(/<\/body>/i,bridge+'</body>');
}

