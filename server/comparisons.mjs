import {randomUUID} from 'node:crypto';
import {createLocalStore,FeatureError} from './local-store.mjs';
import {planComparison} from '../src/lib/comparison.mjs';
export function createComparisons(directory,generate){
 const store=createLocalStore(directory);let active=null;
 let initialization;const init=()=>initialization??=store.list().then(async records=>{for(const r of records)if(['running','queued','stopping'].includes(r.status)){r.status='interrupted';r.jobs=r.jobs.map(j=>['running','submitting'].includes(j.status)?{...j,status:'unknown'}:j.status==='queued'?{...j,status:'not_submitted'}:j);await store.write(`${r.id}.json`,r);}});
 async function run(record){try{
  record.status='running';await store.write(`${record.id}.json`,record);
  for(const job of record.jobs){if(record.stopRequested){job.status='not_submitted';continue;}job.status='running';record.updatedAt=new Date().toISOString();await store.write(`${record.id}.json`,record);
   try{job.result=await generate(job.payload,{groupId:record.id,variant:job.variant,round:job.round,seed:job.seed});job.status='success';}
   catch(e){job.status=e.billingUnknown?'unknown':'error';job.error={message:e.message,code:e.code,billingUnknown:!!e.billingUnknown};record.stopRequested=true;record.status='failed';}
   await store.write(`${record.id}.json`,record);
  }
  if(record.status!=='failed')record.status=record.stopRequested?'stopped':'complete';record.updatedAt=new Date().toISOString();await store.write(`${record.id}.json`,record);
 }finally{if(active===record)active=null;}}
 function publicRecord(record){return {...record,jobs:record.jobs.map(({payload,state,...j})=>j)};}
 return {
  get active(){return active?{id:active.id,status:active.status}:null;},
  async list(){await init();return (await store.list()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(publicRecord);},
  async get(id,{full=false}={}){await init();if(!/^[a-f0-9-]{36}$/.test(id))throw new FeatureError('无效对照记录');const r=active?.id===id?active:await store.read(`${id}.json`);if(!r)throw new FeatureError('对照不存在','not_found',404);return full?r:publicRecord(r);},
  async start(base,config){await init();if(active)throw new FeatureError('已有对照正在执行。','comparison_busy',409);const plan=planComparison(base,config);if(JSON.stringify(plan).length>96*1024*1024)throw new FeatureError('对照图像快照过大，请减少轮数或源图大小。');const now=new Date().toISOString();const record={...plan,id:randomUUID(),createdAt:now,updatedAt:now,status:'queued',stopRequested:false,jobs:plan.jobs.map(j=>({...j,status:'queued'}))};active=record;try{await store.write(`${record.id}.json`,record);}catch(e){active=null;throw e;}setImmediate(()=>run(record).catch(async e=>{record.status='failed';record.error=e.message;await store.write(`${record.id}.json`,record).catch(()=>{});}));return publicRecord(record);},
  async stop(id){await init();if(active?.id!==id)return this.get(id);active.stopRequested=true;active.status='stopping';await store.write(`${id}.json`,active);return publicRecord(active);},
 };
}
