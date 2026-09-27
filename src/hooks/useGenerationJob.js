import {useEffect,useRef,useState} from 'react';
import {startupJSON} from './useStudioConnection';
const KEY='lucifer-active-generation-v1';
const live=status=>['queued','running','stopping'].includes(status);
function stored(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return /^[a-f0-9-]{36}$/.test(x?.id||'')?x:null;}catch{return null;}}
export default function useGenerationJob({enabled,activeId,onUpdate,onError}){
 const callbacks=useRef({onUpdate,onError});callbacks.current={onUpdate,onError};
 const monitor=useRef(null),delivered=useRef(new Set()),[connectionError,setConnectionError]=useState('');
 function cancelWatch(){const old=monitor.current;if(old){clearTimeout(old.timer);old.controller.abort();}monitor.current=null;}
 function remember(value){try{localStorage.setItem(KEY,JSON.stringify(value));}catch{}}
 function watch(id,meta={}){
  if(monitor.current?.id===id)return;cancelWatch();const m={id,meta,controller:new AbortController(),timer:null,notFound:0};monitor.current=m;setConnectionError('');
  const poll=async()=>{
   try{const job=await startupJSON('/api/generation-jobs/'+id,{signal:m.controller.signal,timeoutMs:8000});if(monitor.current!==m)return;m.notFound=0;setConnectionError('');
    if(live(job.status))callbacks.current.onUpdate(job,m.meta);
    else{if(!delivered.current.has(id)){delivered.current.add(id);callbacks.current.onUpdate(job,m.meta);}if(stored()?.id===id)try{localStorage.removeItem(KEY);}catch{}cancelWatch();return;}
   }catch(e){if(monitor.current!==m)return;if(e.status===404&&++m.notFound>=3){callbacks.current.onError('未找到这笔任务的回执；请核对历史，未自动重试。');cancelWatch();return;}setConnectionError('暂时无法读取本地任务；正在重新连接，不会重复提交。');}
   if(monitor.current===m)m.timer=setTimeout(poll,1200);
  };void poll();
 }
 useEffect(()=>{if(!enabled)return;const previous=stored(),id=activeId||previous?.id;if(id)watch(id,previous?.id===id?previous:{});},[enabled,activeId]);
 useEffect(()=>()=>cancelWatch(),[]);
 async function start(payload,meta,options={}){
  const id=crypto.randomUUID(),record={id,...meta};remember(record);
  try{const r=await fetch('/api/generation-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientRequestId:id,payload,...(options.opusBatch?{opusBatch:true}:{})}),signal:AbortSignal.timeout(12000)});const job=await r.json();if(!r.ok){if(r.status>=400&&r.status<500){if(stored()?.id===id)localStorage.removeItem(KEY);throw Object.assign(Error(job.error?.message||'任务未被接受'),{rejected:true});}throw Error(job.error?.message||'提交回执未确认');}callbacks.current.onUpdate(job,record);watch(id,record);}
  catch(e){if(e.rejected)throw e;setConnectionError('提交回执尚未确认，正在查询同一任务；不会重发。');watch(id,record);}
  return id;
 }
 async function stop(options={}){const m=monitor.current;if(!m)return;try{const r=await fetch(`/api/generation-jobs/${m.id}/stop`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cancelCurrent:options.cancelCurrent===true}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('停止请求未确认，可再次点击停止；不会重新提交生成。');const job=await r.json();if(monitor.current===m){setConnectionError('');callbacks.current.onUpdate(job,m.meta);}}catch(e){setConnectionError(e.name==='TimeoutError'?'停止请求超时，可再次点击停止；不会重新提交生成。':e.message);}}
 return {start,stop,connectionError};
}
