import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildRequest,defaults} from '../src/lib/request.mjs';
import {planOpusBatch} from '../src/lib/opus-batch.mjs';
import {createGenerationJobs} from '../server/generation-jobs.mjs';
import {createStudioServer} from '../server/index.mjs';
const payload=(overrides={})=>buildRequest({...defaults(),prompt:'a quiet lake',seed:4294967295,n:3,...overrides});
const until=async predicate=>{for(let i=0;i<250;i++){const value=await predicate();if(value)return value;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for local job');};
async function directory(t,{deferCleanup=false}={}){const dir=await mkdtemp(path.join(tmpdir(),'fx-opus-test-'));if(!deferCleanup)t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('batch freezes final overrides, gives distinct seeds and validates unsupported/costly input before execution',()=>{
 const input=payload(),before=structuredClone(input),plan=planOpusBatch(input);assert.deepEqual(input,before);assert.deepEqual(plan.map(p=>p.novelai.body.parameters.seed),[4294967295,0,1]);assert.ok(plan.every(p=>p.n===1&&p.novelai.body.parameters.n_samples===1));
 for(const values of [{n:1},{steps:29},{width:1536,height:1024},{mode:'img2img',source:'abc'},{extraJSON:'{"future_paid_feature":true}'},{nativeBodyExtras:{url:'https://example.invalid'}},{extraJSON:'{"n_samples":9}'}])assert.throws(()=>planOpusBatch(payload(values)));
});
test('batch accepts once, persists incremental success, survives rereads and freezes request edits',async t=>{
 const dir=await directory(t),calls=[];let release;const gate=new Promise(r=>release=r);const jobs=createGenerationJobs({directory:dir,run:async p=>{calls.push(structuredClone(p));if(calls.length===2)await gate;return {id:String(calls.length),images:[{url:'/image.png'}]};}});
 const input=payload(),id=randomUUID();await jobs.start({clientRequestId:id,payload:input,opusBatch:true});await until(()=>calls.length===2);const mid=await jobs.get(id);assert.deepEqual(mid.batch.items.map(i=>i.status),['success','running','queued']);
 assert.equal((await jobs.start({clientRequestId:id,payload:input,opusBatch:true})).id,id);await assert.rejects(jobs.start({clientRequestId:id,payload:input}),/同一任务/);input.novelai.body.input='changed';release();await until(()=>!jobs.active);const done=await jobs.get(id);assert.equal(done.status,'success');assert.equal(calls.length,3);assert.ok(calls.every(p=>p.novelai.body.input!=='changed'));assert.equal(JSON.parse(await readFile(path.join(dir,id+'.json'))).batch.items.filter(i=>i.status==='success').length,3);
});
test('stop keeps the in-flight image and never submits queued samples',async t=>{
 const dir=await directory(t),calls=[];let release;const gate=new Promise(r=>release=r);const jobs=createGenerationJobs({directory:dir,run:async(p,{signal})=>{calls.push(p);await gate;assert.equal(signal.aborted,false);return {id:'kept',images:[{url:'/kept.png'}]};}}),id=randomUUID();await jobs.start({clientRequestId:id,payload:payload(),opusBatch:true});await until(()=>calls.length);assert.equal((await jobs.stop(id)).status,'stopping');release();await until(()=>!jobs.active);const done=await jobs.get(id);assert.equal(done.status,'stopped');assert.deepEqual(done.batch.items.map(i=>i.status),['success','not_submitted','not_submitted']);assert.equal(calls.length,1);
});
test('ambiguous failure stops the batch without retry and preserves earlier images',async t=>{
 const dir=await directory(t);let calls=0;const jobs=createGenerationJobs({directory:dir,run:async()=>{if(++calls===2)throw Object.assign(Error('connection lost'),{code:'network',billingUnknown:true});return {id:'first',images:[{url:'/one.png'}]};}}),id=randomUUID();await jobs.start({clientRequestId:id,payload:payload(),opusBatch:true});await until(()=>!jobs.active);const done=await jobs.get(id);assert.equal(done.status,'error');assert.deepEqual(done.batch.items.map(i=>i.status),['success','unknown','not_submitted']);assert.equal(calls,2);
});
test('restart retains completed batch images, marks other slots and does not resume',async t=>{
 const dir=await directory(t),id=randomUUID();await writeFile(path.join(dir,id+'.json'),JSON.stringify({kind:'generation-job',id,createdAt:new Date().toISOString(),status:'running',batch:{items:[{index:0,status:'success',result:{images:[{url:'/kept.png'}]}},{index:1,status:'running'},{index:2,status:'queued'}]}}));let calls=0;const jobs=createGenerationJobs({directory:dir,run:async()=>calls++});const record=await jobs.get(id);assert.equal(record.status,'interrupted');assert.deepEqual(record.batch.items.map(i=>i.status),['success','unknown','not_submitted']);assert.equal(calls,0);
});
test('paid policy blocks the first request and is checked again between samples',async t=>{
 const dir=await directory(t);let paid=true,calls=0;const jobs=createGenerationJobs({directory:dir,authorizeBatch:async()=>{if(paid)throw Error('paid');},run:async()=>{calls++;paid=true;return {id:'first',images:[{url:'/one.png'}]};}});await assert.rejects(jobs.start({clientRequestId:randomUUID(),payload:payload(),opusBatch:true}),/paid/);assert.equal(calls,0);paid=false;const id=randomUUID();await jobs.start({clientRequestId:id,payload:payload(),opusBatch:true});await until(()=>!jobs.active);assert.equal(calls,1);assert.equal((await jobs.get(id)).status,'error');
});
test('real HTTP job integration sends two single upstream calls, persists child history and recovers the same batch',async t=>{
 const dir=await directory(t,{deferCleanup:true}),keyPath=path.join(dir,'test.key');await writeFile(keyPath,'local-fixture');const calls=[];
 const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=';
 const server=createStudioServer({root:dir,vault:{seal:async x=>x,open:async x=>x},dataDir:path.join(dir,'data'),outputDir:path.join(dir,'output'),saveDir:path.join(dir,'saved'),keyPath,fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({data:[{b64_json:PNG}]});}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});const origin='http://127.0.0.1:'+server.address().port,id=randomUUID(),body={clientRequestId:id,payload:payload({n:2}),opusBatch:true};
 await fetch(origin+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'openai',baseURL:'https://fixture.example',key:'synthetic-only'})});await fetch(origin+'/api/anlas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pricingPolicy',value:'opus'})});
 const post=()=>fetch(origin+'/api/generation-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal((await post()).status,202);
 const done=await until(async()=>{const r=await(await fetch(origin+'/api/generation-jobs/'+id)).json();return r.status==='success'?r:null;});assert.equal(done.batch.items.length,2);assert.equal((await post()).status,202);assert.equal(calls.length,2);assert.ok(calls.every(p=>p.n===1&&p.novelai.body.parameters.n_samples===1));const history=await(await fetch(origin+'/api/history')).json();assert.equal(history.entries.length,2);assert.ok(history.entries.every(e=>e.batch.id===id));
});

test('immediate cancellation upgrades stop-after-current, retains completed images and skips all pending samples',async t=>{
 const dir=await directory(t);let calls=0,signal;
 const jobs=createGenerationJobs({directory:dir,run:async(p,options)=>{
  if(++calls===1)return {id:'kept',images:[{url:'/kept.png'}]};
  signal=options.signal;
  return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('已停止本地接收'),{code:'request_cancelled',billingUnknown:true,diagnostics:{phase:'connecting',receivedBytes:0,cancelled:true}})),{once:true}));
 }}),id=randomUUID();
 await jobs.start({clientRequestId:id,payload:payload(),opusBatch:true});await until(()=>calls===2);
 const stopping=await jobs.stop(id);assert.equal(signal.aborted,false);assert.equal(stopping.status,'stopping');assert.equal(stopping.batch.items[2].status,'not_submitted');
 await jobs.stop(id,{cancelCurrent:true});await until(()=>!jobs.active);
 const done=await jobs.get(id);assert.equal(signal.aborted,true);assert.equal(done.status,'error');assert.deepEqual(done.batch.items.map(i=>i.status),['success','unknown','not_submitted']);
 assert.equal(done.error.code,'request_cancelled');assert.equal(done.error.billingUnknown,true);assert.equal(done.error.diagnostics.cancelled,true);assert.equal(calls,2);
 assert.equal(done.batch.items[0].result.id,'kept');assert.equal((await jobs.stop(id,{cancelCurrent:true})).status,'error');
 assert.equal((await jobs.start({clientRequestId:id,payload:payload(),opusBatch:true})).status,'error');assert.equal(calls,2);
 const restored=createGenerationJobs({directory:dir,run:()=>{throw Error('must not resubmit');}});assert.equal((await restored.get(id)).status,'error');
});


test('immediate stop before batch execution does not submit any sample',async t=>{
 const dir=await directory(t);let calls=0;const jobs=createGenerationJobs({directory:dir,run:async()=>{calls++;return {images:[{url:'/unexpected.png'}]};}}),id=randomUUID();
 await jobs.start({clientRequestId:id,payload:payload(),opusBatch:true});await jobs.stop(id,{cancelCurrent:true});await until(()=>!jobs.active);
 assert.equal(calls,0);assert.equal((await jobs.get(id)).status,'stopped');assert.ok((await jobs.get(id)).batch.items.every(i=>i.status==='not_submitted'));
 await assert.rejects(jobs.stop(id,{cancelCurrent:'true'}),/标记无效/);
});


test('HTTP immediate batch stop aborts a stalled response without resubmitting or charging queued children',async t=>{
 const dir=await directory(t,{deferCleanup:true}),keyPath=path.join(dir,'fixture.key');await writeFile(keyPath,'local-fixture');let calls=0;
 const server=createStudioServer({root:dir,vault:{seal:async x=>x,open:async x=>x},dataDir:path.join(dir,'data'),outputDir:path.join(dir,'output'),saveDir:path.join(dir,'saved'),authDir:path.join(dir,'auth'),keyPath,fetchImpl:async(url,init)=>{
  calls++;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 }});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port,id=randomUUID(),headers={'Content-Type':'application/json'};
 await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({provider:'openai',baseURL:'https://fixture.example',key:'synthetic-only'})});await fetch(base+'/api/anlas',{method:'POST',headers,body:JSON.stringify({action:'pricingPolicy',value:'opus'})});
 assert.equal((await fetch(base+'/api/generation-jobs',{method:'POST',headers,body:JSON.stringify({clientRequestId:id,payload:payload(),opusBatch:true})})).status,202);await until(()=>calls===1);
 assert.equal((await fetch(base+'/api/generation-jobs/'+id+'/stop',{method:'POST',headers,body:'{}'})).status,200);
 assert.equal((await fetch(base+'/api/generation-jobs/'+id+'/stop',{method:'POST',headers,body:'{"cancelCurrent":true}'})).status,200);
 const done=await until(async()=>{const j=await(await fetch(base+'/api/generation-jobs/'+id)).json();return j.status==='error'?j:null;});
 assert.equal(done.error.code,'request_cancelled');assert.equal(done.error.billingUnknown,true);assert.equal(done.error.diagnostics.cancelled,true);assert.equal(calls,1);
 assert.deepEqual(done.batch.items.map(i=>i.status),['unknown','not_submitted','not_submitted']);await until(async()=>!(await(await fetch(base+'/api/status')).json()).activeGeneration);
});
