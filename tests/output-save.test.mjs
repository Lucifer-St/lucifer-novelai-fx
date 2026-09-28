import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,readdir,mkdir,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createStudioServer} from '../server/index.mjs';import {defaults,buildRequest} from '../src/lib/request.mjs';import pkg from '../package.json' with {type:'json'};
const share=pkg.name.endsWith('-share'),PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=','base64');
const vault={seal:async key=>Buffer.from(key).toString('base64'),open:async v=>Buffer.from(v,'base64').toString()};
async function fixture(t,{hold=false}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-output-toggle-')),dataDir=path.join(root,'data'),outputDir=path.join(root,'output'),saveDir=path.join(root,'saved'),keyPath=path.join(root,'fixture.key');await writeFile(keyPath,'fixture-only-key');let server,base,release,requests=0;
 const options={root,dataDir,outputDir,saveDir,keyPath,authDir:path.join(root,'auth'),vault,fetchImpl:async()=>{requests++;if(hold)await new Promise(r=>{release=r;});return Response.json({data:[{b64_json:PNG.toString('base64')}]});}};
 async function start(){server=createStudioServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
 async function stop(){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await start();t.after(async()=>{release?.();await stop();assert.ok(root.startsWith(path.join(os.tmpdir(),'fx-output-toggle-')));await rm(root,{recursive:true,force:true,maxRetries:8,retryDelay:30});});
 const request=async(p,body)=>{const r=await fetch(base+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:base,'X-FX-Action':'local-files'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 if(share)assert.equal((await request('/api/settings',{provider:'openai',baseURL:'https://fixture.invalid',key:'fixture-only-key'})).status,200);
 return {root,dataDir,outputDir,saveDir,get base(){return base;},request,settings:body=>request(share?'/api/settings':'/api/storage',body),restart:async()=>{await stop();await start();},release:()=>release?.(),get requests(){return requests;}};
}
const pngFiles=async dir=>(await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).filter(n=>n.endsWith('.png'));
const payload=()=>buildRequest({...defaults(),prompt:'local fixture',seed:42});
test('output auto-save defaults on; disabling preserves cached history, restart previews and explicit saves',async t=>{
 const f=await fixture(t);assert.equal((await f.settings()).data.autoSaveOutput,true);const first=await f.request('/api/request',{payload:payload()});assert.equal(first.status,200);assert.equal((await pngFiles(f.outputDir)).length,1);
 assert.equal((await f.settings({autoSaveOutput:false})).status,200);assert.equal((await f.request('/api/status')).data.autoSaveOutput,false);
 const second=await f.request('/api/request',{payload:payload()});assert.equal(second.status,200,JSON.stringify(second.data));const image=second.data.images[0];assert.equal(image.outputPath,undefined);assert.equal(image.savedToLibrary,false);assert.equal((await pngFiles(f.outputDir)).length,1);assert.equal((await pngFiles(path.join(f.dataDir,'results'))).length,1);assert.ok(!(second.data.warnings||[]).some(s=>s.includes('无法写入')));
 const before=Buffer.from(await(await fetch(f.base+image.url)).arrayBuffer());assert.ok(before.length>PNG.length);await f.restart();assert.equal((await f.settings()).data.autoSaveOutput,false);const response=await fetch(f.base+image.url);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),before);
 const history=await f.request('/api/history');assert.ok(history.data.entries.some(e=>e.id===second.data.id));
 let indexed;for(let i=0;i<100;i++){const result=await f.request('/api/generated-library?q=local');indexed=result.data.items?.find(item=>item.result_id===second.data.id);if(indexed)break;await new Promise(r=>setTimeout(r,20));}assert.ok(indexed,'cached result stays in generated library');assert.equal(indexed.hasFile,true);
 const saved=await f.request('/api/save-result',{id:second.data.id,index:0});assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.image.savedToLibrary,true);assert.equal(path.dirname(saved.data.image.savedPath),f.saveDir);assert.equal((await pngFiles(f.saveDir)).length,1);assert.equal((await pngFiles(f.outputDir)).length,1);
 assert.equal((await f.request('/api/save-result',{id:second.data.id,index:0})).data.alreadySaved,true);assert.equal((await pngFiles(f.saveDir)).length,1);
 await f.settings({autoSaveOutput:true});const third=await f.request('/api/request',{payload:payload()});assert.equal(third.status,200);assert.equal((await pngFiles(f.outputDir)).length,2);assert.equal((await fetch(f.base+image.url)).status,200);assert.equal(f.requests,3);
});
test('auto-save settings reject non-boolean values and cannot change during a generation',async t=>{
 const f=await fixture(t,{hold:true});assert.equal((await f.settings({autoSaveOutput:'false'})).status,400);assert.equal((await f.settings()).data.autoSaveOutput,true);
 const pending=f.request('/api/request',{payload:payload()});for(let i=0;i<200&&!f.requests;i++)await new Promise(r=>setTimeout(r,10));assert.equal(f.requests,1);const blocked=await f.settings({autoSaveOutput:false});assert.equal(blocked.status,409);f.release();assert.equal((await pending).status,200);assert.equal((await f.settings()).data.autoSaveOutput,true);assert.equal((await pngFiles(f.outputDir)).length,1);
});

test('output disabled also applies to serial batch results and never replays a completed job',async t=>{
 const f=await fixture(t);await f.settings({autoSaveOutput:false});await f.request('/api/anlas',{action:'pricingPolicy',value:'opus'});const id='11111111-1111-4111-a111-111111111111',body={clientRequestId:id,payload:buildRequest({...defaults(),prompt:'batch fixture',seed:42,n:3}),opusBatch:true};const accepted=await f.request('/api/generation-jobs',body);assert.equal(accepted.status,202,JSON.stringify(accepted.data));
 let done;for(let i=0;i<400;i++){done=(await f.request('/api/generation-jobs/'+id)).data;const status=(await f.request('/api/status')).data;if(done.status==='success'&&!status.activeGeneration)break;await new Promise(r=>setTimeout(r,10));}assert.equal(done.status,'success',JSON.stringify(done));assert.equal(f.requests,3);assert.equal((await pngFiles(f.outputDir)).length,0);assert.equal((await pngFiles(path.join(f.dataDir,'results'))).length,3);
 await f.restart();const restored=await f.request('/api/generation-jobs',body);assert.equal(restored.status,202);assert.equal(restored.data.status,'success');assert.equal(f.requests,3);assert.equal((await pngFiles(f.outputDir)).length,0);
});
