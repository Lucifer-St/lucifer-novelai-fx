import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {once} from 'node:events';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {runCLI} from '../scripts/fx.mjs';
import {createStudioServer} from '../server/index.mjs';
import {CURATED_SEED_IDS} from '../server/library.mjs';
const CLI=path.resolve('scripts/fx.mjs'),exec=promisify(execFile);
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=','base64');
const TEST_KEY='synthetic-cli-gateway-secret';
const ID='11111111-1111-4111-a111-111111111111';
async function temporary(t,{deferCleanup=false}={}){const dir=await mkdtemp(path.join(os.tmpdir(),'fx-cli-test-'));if(!deferCleanup)t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});});return dir;}
async function fixture(t,{stall=false}={}){
 const dir=await temporary(t,{deferCleanup:true}),keyPath=path.join(dir,'test.key'),calls=[];await writeFile(keyPath,TEST_KEY);await mkdir(path.join(dir,'dist'));await writeFile(path.join(dir,'dist','index.html'),'fixture');
 await mkdir(path.join(dir,'data','bootstrap'),{recursive:true});await writeFile(path.join(dir,'data','bootstrap','curated-v1.json'),'{"installed":true}');
 const server=createStudioServer({root:dir,dataDir:path.join(dir,'data'),outputDir:path.join(dir,'output'),saveDir:path.join(dir,'saved'),distDir:path.join(dir,'dist'),authDir:path.join(dir,'auth'),keyPath,fetchImpl:async(url,init)=>{calls.push({url:String(url),method:init.method,body:init.body});if(stall)await new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));return Response.json({data:[{b64_json:PNG.toString('base64')}]});}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});});const port=String(server.address().port);
 await fetch('http://127.0.0.1:'+port+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'openai',baseURL:'https://fixture.invalid',key:TEST_KEY,tutorialComplete:true})});
 await fetch('http://127.0.0.1:'+port+'/api/anlas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pricingPolicy',value:'opus'})});
 return {dir,calls,port,run:async args=>{const result=await exec(process.execPath,[CLI,...args,'--port',port],{timeout:10000,maxBuffer:2*1024*1024});assert.equal(result.stderr,'');assert.ok(!result.stdout.includes(TEST_KEY));return JSON.parse(result.stdout);}};
}
test('CLI help and planning are offline, resolve seed once and honor explicit parameter flags',async t=>{
 const dir=await temporary(t);let network=0;const env={fetchImpl:()=>{network++;throw Error('must not fetch');}};
 const caps=await runCLI(['help','--json'],env);assert.equal(caps.data.commands.generate.billing,'possible');
 const state=path.join(dir,'state.json');await writeFile(state,'\uFEFF'+JSON.stringify({version:1,state:{prompt:'a quiet lake',steps:23,overrides:{steps:30,qualityToggle:true},extraJSON:'{"scale": 9}'}}));
 const p=(await runCLI(['plan','--state',state,'--steps','25','--scale','6','--count','3','--opus-batch','--no-quality','--transparent-bg'],env)).data;
 assert.ok(p.clientRequestId);assert.equal(p.requests,3);assert.ok(Number.isInteger(p.payload.novelai.body.parameters.seed));assert.equal(p.payload.novelai.body.parameters.steps,25);assert.equal(p.payload.novelai.body.parameters.scale,6);assert.equal(p.payload.novelai.body.parameters.qualityToggle,false);assert.match(p.payload.novelai.body.input,/transparent background/);assert.ok(!p.payload.novelai.body.input.includes('masterpiece'));
 const file=path.join(dir,'plan.json');await runCLI(['plan','--prompt','lake','--seed','42','--out',file],env);const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.payload.novelai.body.parameters.seed,42);await assert.rejects(runCLI(['plan','--prompt','different','--out',file],env),e=>e.code==='EEXIST');assert.equal(network,0);
});
test('CLI rejects malformed flags and output destinations before submitting anything',async()=>{
 let calls=0;const env={fetchImpl:()=>{calls++;throw Error('not allowed');}};
 for(const args of [['generate','--prompt','lake','--out','existing.json'],['generate','--prompt','lake','--wait','--timeout','bad'],['generate','--prompt','lake','--timeout','10'],['plan','--state','-','--prompt-file','-'],['status','--port','0'],['generate','--plan','plan.json','--seed','42']])await assert.rejects(runCLI(args,env));
 assert.equal(calls,0);
});
test('actual CLI subprocess submits one persistent job, reuses its frozen ID, reads history and explicitly saves',async t=>{
 const f=await fixture(t),plan=path.join(f.dir,'plan.json');await exec(process.execPath,[CLI,'plan','--prompt','a quiet lake','--seed','42','--id',ID,'--out',plan]);
 const done=await f.run(['generate','--plan',plan,'--wait','--interval','250']);assert.equal(done.status,'success');assert.equal(done.id,ID);assert.equal(done.result.images.length,1);assert.equal(f.calls.length,1);
 const duplicate=await f.run(['generate','--plan',plan]);assert.equal(duplicate.clientRequestId,ID);assert.equal(f.calls.length,1);
 const history=await f.run(['history','--limit','1']);assert.equal(history.entries.length,1);const entry=history.entries[0];const recipe=await f.run(['recipe',entry.id]);assert.equal(recipe.novelai.body.parameters.seed,42);assert.equal((await readdir(path.join(f.dir,'output'))).filter(n=>n.endsWith('.png')).length,1);
 const saved=await f.run(['save',entry.id]);assert.equal(saved.image.savedToLibrary,true);assert.equal((await readdir(path.join(f.dir,'saved'))).filter(n=>n.endsWith('.png')).length,1);assert.equal(f.calls.length,1);
});
test('CLI library create, optimistic revision conflicts and export remain local',async t=>{
 const f=await fixture(t),file=path.join(f.dir,'card.json');await writeFile(file,JSON.stringify({kind:'snippet',title:'CLI fixture',category:'场景',text:'blue sky, lake'}));
 const entry=await f.run(['library','put','--file',file]);assert.equal(entry.revision,1);const list=await f.run(['library','list','--query','CLI fixture']);assert.equal(list.entries.length,1);assert.equal((await f.run(['library','get',entry.id])).text,'blue sky, lake');
 await writeFile(file,JSON.stringify({...entry,revision:0,title:'stale'}));await assert.rejects(f.run(['library','put','--file',file]),e=>{assert.equal(JSON.parse(e.stderr).error.code,'revision_conflict');return true;});
 const exported=await f.run(['library','export']),byId=new Map(exported.entries.map(item=>[item.id,item]));
 assert.equal(exported.format,'lucifer-library');assert.equal(exported.entries.length,4);assert.equal(new Set(exported.entries.map(item=>item.id)).size,4);
 assert.deepEqual({...byId.get(entry.id),createdAt:undefined,updatedAt:undefined},{...entry,createdAt:undefined,updatedAt:undefined});assert.equal(byId.get(entry.id).text,'blue sky, lake');
 assert.deepEqual([CURATED_SEED_IDS.Rena,CURATED_SEED_IDS.Noire,CURATED_SEED_IDS.Claire].map(id=>byId.get(id)?.title),['Rena','Noire','Claire']);assert.equal(f.calls.length,0);
});
test('actual CLI submits a serial Opus batch using one acceptance POST',async t=>{
 const f=await fixture(t);const job=await f.run(['generate','--prompt','quiet landscape','--seed','42','--count','3','--opus-batch','--wait','--interval','250']);assert.equal(job.status,'success');assert.equal(job.batch.items.length,3);assert.equal(f.calls.length,3);const params=f.calls.map(c=>JSON.parse(c.body).novelai.body.parameters);assert.deepEqual(params.map(p=>p.n_samples),[1,1,1]);assert.deepEqual(params.map(p=>p.seed),[42,43,44]);
});
test('actual CLI waiting can end independently and explicit stop cancels only its accepted job',async t=>{
 const f=await fixture(t,{stall:true});const submitted=await f.run(['generate','--prompt','quiet landscape','--seed','42']);
 await assert.rejects(f.run(['job','wait',submitted.clientRequestId,'--timeout','0']),e=>{assert.equal(e.code,4);assert.equal(JSON.parse(e.stdout).waiting,true);return true;});
 assert.equal((await f.run(['job','get',submitted.clientRequestId])).status,'running');for(let i=0;i<100&&!f.calls.length;i++)await new Promise(r=>setTimeout(r,20));assert.equal(f.calls.length,1);await f.run(['job','stop',submitted.clientRequestId]);let job;for(let i=0;i<20;i++){job=await f.run(['job','get',submitted.clientRequestId]);if(job.status==='error')break;await new Promise(r=>setTimeout(r,20));}assert.equal(job.error.code,'request_cancelled');assert.equal(f.calls.length,1);
});
test('ambiguous submit emits the same task ID and makes no retry',async()=>{
 let posts=0;await assert.rejects(runCLI(['generate','--prompt','lake','--seed','42','--id',ID,'--port','18888'],{fetchImpl:async(url,init)=>{assert.equal(init.headers.Authorization,undefined);if(url.endsWith('/api/status'))return Response.json({app:'Lucifer NovelAI FX',shareEdition:true,generationJobs:true});posts++;throw new TypeError('response lost');}}),e=>{assert.equal(e.details.clientRequestId,ID);assert.equal(e.details.submissionUnknown,true);assert.match(e.details.nextCommand,/job get.*--port 18888/);return true;});assert.equal(posts,1);
});
test('waiting timeout does not stop a job; terminal failures remain non-success',async()=>{
 const calls=[];let status='running';const env={fetchImpl:async(url,init)=>{calls.push(init.method);return Response.json(url.endsWith('/api/status')?{app:'Lucifer NovelAI FX',shareEdition:true,generationJobs:true}:{id:ID,status});}};
 const timed=await runCLI(['job','wait',ID,'--timeout','0'],env);assert.equal(timed.exitCode,4);assert.equal(timed.data.waiting,true);status='error';assert.equal((await runCLI(['job','wait',ID],env)).exitCode,3);assert.ok(calls.every(x=>x==='GET'));
});
test('start reuses a running service and unrelated loopback services cannot receive writes',async()=>{
 let starts=0,posts=0;const env={startService:async()=>{starts++;},fetchImpl:async(url,init)=>{if(init.method==='POST')posts++;return Response.json({app:'unrelated',generationJobs:true});}};
 await assert.rejects(runCLI(['generate','--prompt','lake'],env),e=>e.code==='wrong_service');await assert.rejects(runCLI(['start'],env),e=>e.code==='wrong_service');assert.equal(starts,0);assert.equal(posts,0);
 const result=await runCLI(['start'],{...env,fetchImpl:async()=>Response.json({app:'Lucifer NovelAI FX',shareEdition:true,generationJobs:true})});assert.equal(result.data.app,'Lucifer NovelAI FX');assert.equal(starts,0);
});
test('cold start only launches after connection refused, never on an unresponsive occupied port',async()=>{
 let started=false;const cold={startService:async()=>{started=true;},fetchImpl:async()=>{if(!started)throw new TypeError('fetch failed',{cause:{code:'ECONNREFUSED'}});return Response.json({app:'Lucifer NovelAI FX',shareEdition:true,generationJobs:true});}};assert.equal((await runCLI(['start'],cold)).data.app,'Lucifer NovelAI FX');assert.equal(started,true);
 let launched=false;await assert.rejects(runCLI(['start'],{startService:async()=>{launched=true;},fetchImpl:async()=>{throw new TypeError('timeout',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});}}));assert.equal(launched,false);
});
