import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/api.mjs';
import AtlasIcon from './AtlasIcon';
import {ExternalLink,Plus,RefreshCw,ImagePlus} from 'lucide-react';
import {ATLAS_URL} from '../lib/atlas-embed.mjs';
export {ATLAS_URL};
export default function AtlasPanel({active,onCollect,onImport}){
 const [revision,setRevision]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const frame=useRef(null),pending=useRef(null),controller=useRef(null),activeRef=useRef(active);activeRef.current=active;
 const saves=useRef(Promise.resolve()),snapshot=useRef(null),[storageError,setStorageError]=useState(''),[refreshing,setRefreshing]=useState(false);
 const [networkError,setNetworkError]=useState(''),resources=useRef(new Set());
 function persist(operation){
  const next=saves.current.catch(()=>{}).then(()=>api('/api/atlas/storage',{method:'POST',body:operation,keepalive:new TextEncoder().encode(JSON.stringify(operation)).length<60000}));
  saves.current=next;next.catch(e=>setStorageError('图鉴设置未能保存：'+e.message+' 当前页面已保留，可点击刷新重试保存。'));return next;
 }
 async function refresh(){
  if(!ready){setRevision(v=>v+1);return;}
  setRefreshing(true);setStorageError('');
  try{const items=await new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{snapshot.current=null;reject(Error('未能读取当前图鉴设置，请保留页面后重试。'));},6000);snapshot.current={id,timer,resolve,reject};frame.current?.contentWindow.postMessage({type:'lucifer-atlas-storage-snapshot-request',id},'*');});await persist({action:'replace',items});cancel();setRevision(v=>v+1);}
  catch(e){setStorageError('刷新已暂停：'+e.message);}
  finally{setRefreshing(false);}
 }
 useEffect(()=>{setReady(false);setError('');},[revision]);
 useEffect(()=>{setNetworkError('');return()=>{for(const request of resources.current)request.abort();resources.current.clear();};},[revision]);
 useEffect(()=>{if(ready)return;const timer=setTimeout(()=>setNetworkError('图鉴页面尚未连接完成。可点击右侧刷新重试，或在原站查看；这不代表生图服务离线。'),35000);return()=>clearTimeout(timer);},[ready,revision]);
 function cancel(){if(pending.current){clearTimeout(pending.current.timer);pending.current=null;}controller.current?.abort();controller.current=null;setBusy(false);}
 useEffect(()=>{if(!active)cancel();},[active]);
 useEffect(()=>{async function receive(event){
  if(event.source!==frame.current?.contentWindow||event.origin!=='null')return;
  if(event.data?.type==='lucifer-atlas-storage-change'){persist(event.data.operation);return;}
  if(event.data?.type==='lucifer-atlas-storage-snapshot'&&snapshot.current?.id===event.data.id){const task=snapshot.current;clearTimeout(task.timer);snapshot.current=null;task.resolve(event.data.items);return;}
  if(event.data?.type==='lucifer-atlas-resource-request'){
   const target=event.source,id=event.data.id,request=new AbortController();resources.current.add(request);try{const r=await fetch('/api/atlas/resource?'+new URLSearchParams({url:event.data.url}),{signal:request.signal});if(!r.ok){const body=await r.json().catch(()=>null);throw Error(body?.error?.message||'图鉴数据暂时无法读取，请刷新重试。');}const bytes=await r.arrayBuffer();if(!request.signal.aborted&&frame.current?.contentWindow===target)target.postMessage({type:'lucifer-atlas-resource-result',id,bytes},'*',[bytes]);}catch(e){if(!request.signal.aborted){const message=e instanceof TypeError?'无法连接应用本机服务，请确认应用仍在运行。':e.message;setNetworkError(message);target.postMessage({type:'lucifer-atlas-resource-result',id,error:message},'*');}}finally{resources.current.delete(request);}return;
  }
  if(event.data?.type==='lucifer-atlas-ready'){setReady(true);setNetworkError(message=>message.startsWith('图鉴页面尚未连接完成')?'':message);return;}
  if(event.data?.type!=='lucifer-atlas-import-result'||!pending.current||event.data.id!==pending.current.id||!activeRef.current)return;
  clearTimeout(pending.current.timer);pending.current=null;
  if(event.data.error){setError(event.data.error);setBusy(false);return;}
  const ac=new AbortController();controller.current=ac;
  try{const response=await fetch('/api/atlas/original?'+new URLSearchParams({url:event.data.url}),{signal:ac.signal});if(!response.ok){const data=await response.json();throw Error(data.error?.message||'原图读取失败。');}const blob=await response.blob();ac.signal.throwIfAborted();const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';await onImport(new File([blob],'法典图鉴-原图.'+ext,{type:blob.type}));}catch(e){if(!ac.signal.aborted)setError(e.message);}finally{if(controller.current===ac){controller.current=null;setBusy(false);}}
 };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[onImport]);
 useEffect(()=>()=>{if(pending.current)clearTimeout(pending.current.timer);controller.current?.abort();},[]);
 function requestImport(){setError('');setBusy(true);const id=crypto.randomUUID();pending.current={id,timer:setTimeout(()=>{pending.current=null;setBusy(false);setError('图鉴尚未准备好，或原站结构已变化。可刷新后重试，也可从原站下载原图再导入。');},12000)};frame.current?.contentWindow.postMessage({type:'lucifer-atlas-import-request',id},'*');}
 return <div className="atlas-workspace"><div className="atlas-toolbar"><div><h3><AtlasIcon size={23}/>法典图鉴</h3><p>点开例图后可直接导入原图；关闭面板会保留当前页面。</p></div><button className="primary" disabled={!ready||busy||!active} onClick={requestImport}><ImagePlus size={14}/>{busy?'正在读取原图…':'导入当前原图'}</button><a className="button" href={ATLAS_URL} target="_blank" rel="noreferrer"><ExternalLink size={14}/>在原站打开</a><button onClick={()=>onCollect({kind:'favorite',title:'',category:'画风',text:'',notes:'',sourceUrl:ATLAS_URL,cover:'',payload:null})}><Plus size={14}/>收藏为卡片</button><button aria-label="刷新法典图鉴" title="重新加载图鉴" disabled={refreshing} onClick={refresh}><RefreshCw size={16}/></button></div>{networkError&&<p className="atlas-error" role="alert">{networkError}</p>}{storageError&&<p className="atlas-error" role="alert">{storageError}</p>}{error&&<p className="atlas-error" role="alert">{error}</p>}<iframe ref={frame} title="法典图鉴原站" src={`/api/atlas/frame?c=artist_nai5_personal&v=${revision}`} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerPolicy="no-referrer"/><small>图鉴设置自动保存在本机，刷新和重开后保留。点击导入时读取所选原图，不会自动生成。</small></div>;
}
