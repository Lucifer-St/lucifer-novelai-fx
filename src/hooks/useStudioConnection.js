import {useCallback,useEffect,useRef,useState} from 'react';

export async function startupJSON(url,{signal,timeoutMs=8000}={}){
 const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(),timeoutMs);
 try{
  const response=await fetch(url,{signal:signal?AbortSignal.any([signal,deadline.signal]):deadline.signal});
  const data=await response.json();
  if(!response.ok)throw Object.assign(Error(data.error?.message||`读取失败 (${response.status})`),{status:response.status});
  return data;
 }catch(error){if(deadline.signal.aborted)throw Error('连接检查超时');throw error;}
 finally{clearTimeout(timer);}
}

// Local readiness and remote discovery are independent. V5 has a bundled request
// schema; a slow model-list GET must not lock local editing/history/generation.
export default function useStudioConnection(){
 const [status,setStatus]=useState(null),[localPhase,setLocalPhase]=useState('loading'),[localError,setLocalError]=useState('');
 const [models,setModels]=useState([]),[modelPhase,setModelPhase]=useState('loading'),[modelError,setModelError]=useState(''),[modelHTTP,setModelHTTP]=useState(null);
 const [gatewayError,setGatewayError]=useState('');
 const active=useRef({local:null,models:null});
 const checkLocal=useCallback(async()=>{
  active.current.local?.abort();const controller=new AbortController();active.current.local=controller;
  setLocalPhase('loading');setLocalError('');
  try{const data=await startupJSON('/api/status',{signal:controller.signal,timeoutMs:5000});if(controller.signal.aborted)return;setStatus(data);setLocalPhase('ready');}
  catch(e){if(!controller.signal.aborted){setLocalPhase('error');setLocalError(e.message);}}
 },[]);
 const checkModels=useCallback(async()=>{
  setGatewayError('');
  active.current.models?.abort();const controller=new AbortController();active.current.models=controller;
  setModelPhase('loading');setModelError('');setModelHTTP(null);
  try{const data=await startupJSON('/api/models',{signal:controller.signal,timeoutMs:12000});if(controller.signal.aborted)return;if(!Array.isArray(data.data))throw Error('模型列表格式无效');setModels(data.data.filter(m=>m.id==='nai-diffusion-5-full'));setModelPhase('ready');}
  catch(e){if(!controller.signal.aborted){setModelPhase('error');setModelError(e.message);setModelHTTP(e.status||null);}}
 },[]);
 useEffect(()=>{checkLocal();checkModels();return()=>{active.current.local?.abort();active.current.models?.abort();};},[checkLocal,checkModels]);
 const serverBusy=!!(status?.generationBusy||status?.activeComparison);
 useEffect(()=>{
  if(!serverBusy)return;let live=true,timer;
  const poll=async()=>{await checkLocal();if(live)timer=setTimeout(poll,1500);};timer=setTimeout(poll,1500);
  return()=>{live=false;clearTimeout(timer);};
 },[serverBusy,checkLocal]);
 const blocked=!status ? localPhase==='error'?'本地服务未连接，请重新检查连接。':'正在读取本地状态…'
   :localPhase==='error'?'本地服务暂时不可达，请重新检查连接。'
   :!status.keyConfigured?'尚未配置 API，请打开设置填写自己的 Token / Key。'
   :serverBusy?'服务端还有生成任务在处理，请等待结束；不会自动重试。'
   :[401,403].includes(modelHTTP)?'网关鉴权未通过，请检查连接与密钥权限。'
   :modelPhase==='ready'&&!models.length?'当前网关模型列表未提供 V5 Full。':'';
 const checkConnection=useCallback(()=>{checkLocal();checkModels();},[checkLocal,checkModels]);
 const reportGatewayFailure=useCallback(message=>setGatewayError(message||'最近一次生成连接失败，请重新检查连接。'),[]);
 const reportGatewaySuccess=useCallback(()=>setGatewayError(''),[]);
 return {status,models,localPhase,localError,modelPhase:gatewayError?'error':modelPhase,modelError:gatewayError||modelError,serverBusy,blocked,checkConnection,checkLocal,reportGatewayFailure,reportGatewaySuccess};
}
