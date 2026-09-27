import {createHash} from 'node:crypto';
import {createLocalStore,FeatureError} from './local-store.mjs';
import {planOpusBatch} from '../src/lib/opus-batch.mjs';
const running=s=>['queued','running','stopping'].includes(s);
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export function createGenerationJobs({directory,run,isBusy=()=>false,authorizeBatch=async()=>{},timeoutMs=600000}){
 const store=createLocalStore(directory),terminal=new Map();let current=null;
 const ready=store.serial(async()=>{for(const job of await store.list())if(job.kind==='generation-job'&&running(job.status)){job.status='interrupted';job.phase='unknown';job.finishedAt=new Date().toISOString();job.error={code:'interrupted',message:'本地服务曾重启，此任务没有最终回执，未自动重试。',billingUnknown:true};if(job.batch)job.batch.items=job.batch.items.map(item=>({...item,status:item.status==='running'?'unknown':item.status==='queued'?'not_submitted':item.status}));await store.write(job.id+'.json',job);}});
 const view=job=>job?{...job,elapsedMs:Math.max(0,(job.finishedAt?Date.parse(job.finishedAt):Date.now())-Date.parse(job.createdAt))}:null;
 async function persist(job){const snapshot=structuredClone(job);delete snapshot.preview;return store.serial(()=>store.write(job.id+'.json',snapshot));}
 async function executeBatch(job,payloads,controller){
  try{
   job.status=job.stopRequested?'stopping':'running';await persist(job);
   for(const item of job.batch.items){
    if(job.stopRequested){item.status='not_submitted';continue;}
    let lastSave=0;
    try{
     await authorizeBatch();
     // Stop may arrive during the asynchronous policy check.
     if(job.stopRequested){item.status='not_submitted';continue;}
     item.status='running';job.batch.activeIndex=item.index;job.phase='preparing';job.receivedBytes=0;delete job.requestId;delete job.preview;
     await persist(job);
     if(job.cancelRequested){item.status='not_submitted';continue;}
     const progress=patch=>{Object.assign(job,patch,{updatedAt:new Date().toISOString()});if(Date.now()-lastSave>1000){lastSave=Date.now();void persist(job).catch(()=>{});}};
     const result=await run(payloads[item.index],{signal:controller.signal,onProgress:progress,onEvent:event=>{if(event.type==='event'){job.streamEvents=(job.streamEvents||0)+1;if(typeof event.data?.image==='string'&&event.data.image.length<4*1024*1024)job.preview=`data:image/jpeg;base64,${event.data.image}`;}},timeoutMs,batch:{id:job.id,index:item.index,count:payloads.length,seed:item.seed}});
     item.result=result;
     if(result.images?.length!==1)throw Object.assign(Error('单张请求没有返回恰好一张图片，已停止后续任务；请核对历史。'),{code:'unexpected_batch_result',billingUnknown:true});
     item.status='success';item.finishedAt=new Date().toISOString();
    }catch(e){item.status=e.billingUnknown?'unknown':'error';item.error={code:e.code||'generation_error',message:e.message,requestId:e.requestId,billingUnknown:!!e.billingUnknown,diagnostics:e.diagnostics};job.error=item.error;job.stopRequested=true;job.status='error';}
    delete job.preview;await persist(job);
   }
   if(job.status!=='error')job.status=job.stopRequested?'stopped':'success';
   job.phase=job.status==='success'?'complete':job.status==='stopped'?'stopped':'unknown';
  }catch(e){job.status='error';job.error={code:'batch_storage_error',message:e.message,billingUnknown:true};}
  finally{for(const item of job.batch.items)if(item.status==='queued')item.status='not_submitted';job.finishedAt=new Date().toISOString();delete job.preview;terminal.set(job.id,structuredClone(job));while(terminal.size>30)terminal.delete(terminal.keys().next().value);await persist(job).catch(()=>{});if(current?.job.id===job.id)current=null;}
 }
 async function execute(job,payload,controller){
  let lastSave=0;
  function progress(patch){Object.assign(job,patch,{updatedAt:new Date().toISOString()});if(Date.now()-lastSave>1000){lastSave=Date.now();void persist(job).catch(()=>{});}}
  try{job.status='running';await persist(job);const result=await run(payload,{signal:controller.signal,onProgress:progress,onEvent:event=>{if(event.type==='event'){job.streamEvents=(job.streamEvents||0)+1;const data=event.data;if(typeof data?.image==='string'&&data.image.length<4*1024*1024)job.preview=`data:image/jpeg;base64,${data.image}`;}},timeoutMs});job.result=result;job.status=result.images?.length?'success':'unknown';job.phase=job.status==='success'?'complete':'unknown';if(job.status==='unknown')job.error={code:'missing_image',message:'已收到响应，但没有可用图片；请检查原始响应，不会自动重试。',billingUnknown:true};}
  catch(e){job.status='error';job.error={code:e.code||'generation_error',message:e.message||'生成请求未完成',requestId:e.requestId,billingUnknown:!!e.billingUnknown,diagnostics:e.diagnostics};}
  finally{job.finishedAt=new Date().toISOString();delete job.preview;terminal.set(job.id,structuredClone(job));while(terminal.size>30)terminal.delete(terminal.keys().next().value);await persist(job).catch(()=>{});if(current?.job.id===job.id)current=null;}
 }
 return {
  ready,
  get active(){return current?view(current.job):null;},
  async get(id){await ready;if(!validId(id))throw new FeatureError('任务 ID 无效。');const job=current?.job.id===id?current.job:terminal.get(id)||await store.read(id+'.json');if(!job)throw new FeatureError('未找到该生成任务；请先检查历史，勿重复提交。','not_found',404);return view(job);},
   async start({clientRequestId,payload,opusBatch=false}){
   await ready;if(!validId(clientRequestId))throw new FeatureError('需要有效的 clientRequestId。');
   const endpoint=payload?.novelai?.endpoint;if(!['/ai/generate-image','/ai/generate-image-stream','/ai/upscale','/ai/augment-image'].includes(endpoint))throw new FeatureError('此任务接口仅支持图像生成和图像工具。');
    if(typeof opusBatch!=='boolean')throw new FeatureError('逐张模式标记无效。');
    const frozen=structuredClone(payload),plan=opusBatch?planOpusBatch(frozen):null,fingerprint=createHash('sha256').update(JSON.stringify(opusBatch?{opusBatch:true,payload:frozen}:frozen)).digest('hex');
   return store.serial(async()=>{
    const old=await store.read(clientRequestId+'.json');if(old){if(old.fingerprint!==fingerprint)throw new FeatureError('同一任务 ID 不能提交不同参数。','idempotency_conflict',409);return view(current?.job.id===old.id?current.job:terminal.get(old.id)||old);}
     if(current||isBusy())throw new FeatureError('服务端已有生成任务，不能重复提交。','generation_busy',409);
     if(plan)await authorizeBatch();
     const p=frozen.novelai.body?.parameters||{},now=new Date().toISOString(),job={version:1,kind:'generation-job',id:clientRequestId,fingerprint,status:'queued',phase:'queued',createdAt:now,updatedAt:now,timeoutMs,width:p.width||1024,height:p.height||1024,receivedBytes:0};
     if(plan)job.batch={mode:'opus-single',count:plan.length,items:plan.map((entry,index)=>({index,seed:entry.novelai.body.parameters.seed,status:'queued'}))};
    await store.write(job.id+'.json',job);const controller=new AbortController();current={job,controller};
    // Defer execution until this serialized acceptance has released the store.
     setTimeout(()=>{void (plan?executeBatch(job,plan,controller):execute(job,frozen,controller));},0);return view(job);
   });
  },
   async stop(id,{cancelCurrent=false}={}){
    if(typeof cancelCurrent!=='boolean')throw new FeatureError('停止当前接收的标记无效。');
    await ready;const job=await this.get(id);
    if(current?.job.id!==id)return job;
    const active=current;if(!running(active.job.status))return view(active.job);active.job.status='stopping';
    if(active.job.batch){
     active.job.stopRequested=true;
     for(const item of active.job.batch.items)if(item.status==='queued')item.status='not_submitted';
     if(cancelCurrent){active.job.cancelRequested=true;active.controller.abort();}
     await persist(active.job);
    }else active.controller.abort();
    return view(active.job);
   },
 };
}
