import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,cp,symlink,unlink,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {createAppUpdater,validateUpdateArchive,downloadReleaseAsset,safeUpdatePath,assertUpdateStorage} from '../server/app-updater.mjs';
import {applyUpdate,recoverUpdate} from '../scripts/apply-update.mjs';
import {createStudioServer} from '../server/index.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value));
const waitFor=async predicate=>{for(let i=0;i<300;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('State transition timed out');};
test('restarted service preserves the installing guard until the external helper finishes',async t=>{
 const root=await temporary(t),dataDir=path.join(root,'userdata');await mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'update-status.json');
 await writeFile(file,JSON.stringify({status:'installing',targetVersion:'9.0.0'}));
 const service=createAppUpdater({root,dataDir,currentVersion:'9.0.0',installId:'fixture',platform:'win32',execPath:path.join(root,'runtime/node.exe'),releaseServices:{}});
 assert.equal((await service.info()).status,'installing');assert.equal(service.active,true);assert.equal((await service.info()).canCancel,false);
 await assert.rejects(()=>service.cancel(),/不能取消/);await assert.rejects(()=>service.prepare(),/不能重新下载/);
 await writeFile(file,JSON.stringify({status:'succeeded',targetVersion:'9.0.0'}));assert.equal((await service.info()).status,'succeeded');assert.equal(service.active,false);
});
test('downloads can be cancelled before headers or mid-body; stalled and total deadlines do not retry',async()=>{
 const keepAlive=setInterval(()=>{},1000);
 try{
  for(const midBody of [false,true]){
   const controller=new AbortController();let calls=0,cancelled=false;
   const result=downloadReleaseAsset('https://github.com/a/b',{signal:controller.signal,fetchImpl:async()=>{calls++;return midBody?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}})):new Promise(()=>{});}});
   await new Promise(r=>setTimeout(r,15));controller.abort(new DOMException('cancelled','AbortError'));
   await assert.rejects(result,{name:'AbortError'});assert.equal(calls,1);if(midBody)assert.equal(cancelled,true);
  }
  await assert.rejects(downloadReleaseAsset('https://github.com/a/b',{stallTimeoutMs:20,fetchImpl:()=>new Promise(()=>{})}),{code:'update_stalled'});
  let interval;
  await assert.rejects(downloadReleaseAsset('https://github.com/a/b',{stallTimeoutMs:100,totalTimeoutMs:70,fetchImpl:async()=>new Response(new ReadableStream({start(c){interval=setInterval(()=>c.enqueue(new Uint8Array([1])),10);},cancel(){clearInterval(interval);}}))}),{code:'update_timeout'});
 }finally{clearInterval(keepAlive);}
});
test('cancelled prepare cleans only its staging; late metadata cannot override a fresh retry',async t=>{
 const root=await temporary(t),dataDir=path.join(root,'userdata'),fixture=archive();
 await filesTo(root,{'runtime/node.exe':'runtime','app/scripts/apply-update.mjs':'helper','启动 Lucifer FX.exe':'launcher','userdata/keep.json':'user data','userdata/updates/older-backup/keep':'recovery'});
 const release={status:'update_available',latestVersion:fixture.version,download:{name:'Lucifer-NovelAI-FX-Share-9.0.0-Windows-x64.zip',url:'https://github.com/a/b/releases/download/v9/a.zip',sha256:fixture.sha256,bytes:fixture.bytes.length}};
 let checks=0,late,downloads=0,hold=true;
 const service=createAppUpdater({root,dataDir,currentVersion:'1.0.0',installId:'fixture',platform:'win32',execPath:path.join(root,'runtime/node.exe'),releaseServices:{checkUpdates:()=>++checks===1?new Promise(r=>{late=r;}):release},fetchImpl:async()=>{downloads++;return hold?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));}})):new Response(fixture.bytes);}});
 await service.prepare();await waitFor(()=>!!late);assert.equal((await service.cancel()).status,'cancelled');assert.equal(service.active,false);
 await service.prepare();await waitFor(async()=>(await service.info()).downloaded===1);
 assert.equal((await service.cancel()).status,'cancelled');assert.deepEqual(await readdir(path.join(dataDir,'updates')),['older-backup']);
 hold=false;await service.prepare();await waitFor(async()=>(await service.info()).status==='prepared');late(release);await new Promise(r=>setTimeout(r,30));
 assert.equal((await service.info()).status,'prepared');assert.equal((await service.info()).canCancel,false);assert.equal(downloads,2);assert.equal(checks,3);
 assert.equal((await service.cancel()).status,'prepared');assert.equal(await readFile(path.join(dataDir,'keep.json'),'utf8'),'user data');assert.equal(await readFile(path.join(dataDir,'updates/older-backup/keep'),'utf8'),'recovery');
 assert.equal(JSON.parse(await readFile(path.join(dataDir,'update-status.json'))).status,'prepared');
});
test('cancel API requires installation identity and origin, releases the shutdown lock',async t=>{
 const root=await temporary(t),dataDir=path.join(root,'userdata');
 await filesTo(root,{'runtime/node.exe':'runtime'});
 const server=createStudioServer({root,dataDir,installId:'fixture',residentHost:false,releaseRepository:'fixture/release',updaterOptions:{platform:'win32',execPath:path.join(root,'runtime/node.exe'),releaseServices:{checkUpdates:()=>new Promise(()=>{})}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const post=(route,extra={})=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-FX-Action':'update','X-FX-Install-Id':'fixture',...extra},body:'{}'});
 assert.equal((await post('/api/update/prepare')).status,202);
 for(const extra of [{Origin:'https://evil.test'},{'X-FX-Install-Id':'wrong'},{'X-FX-Action':'wrong'}])assert.equal((await post('/api/update/cancel',extra)).status,403);
 assert.equal((await post('/api/shutdown',{'X-FX-Action':'shutdown'})).status,409);
 const cancelled=await post('/api/update/cancel');assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).status,'cancelled');
 assert.equal((await post('/api/shutdown',{'X-FX-Action':'shutdown'})).status,200);
});
function archive(version='9.0.0',extra={}){
 const files=Object.fromEntries(Object.entries({'app/server/index.mjs':'new server','app/dist/index.html':'new html','app/scripts/apply-update.mjs':'new helper','runtime/node.exe':'new runtime','启动 Lucifer FX.exe':'new launcher',...extra}).map(([k,v])=>[k,encode(v)]));
 const manifest={product:'Lucifer NovelAI FX Share',version,files:Object.entries(files).map(([name,b])=>({path:name,bytes:b.length,sha256:hash(b)}))};
 files['manifest.json']=encode(manifest);const bytes=zipSync(files);return {bytes,files,sha256:hash(bytes),version,manifestSHA256:hash(files['manifest.json'])};
}
async function temporary(t){const base=await realpath(os.tmpdir()),root=await mkdtemp(path.join(base,'fx-update-test-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(base+path.sep+'fx-update-test-'));await rm(root,{recursive:true,force:true});});return root;}
async function filesTo(root,files){for(const [name,b] of Object.entries(files)){const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,b);}}
test('update ZIP requires repository digest, exact version, per-file hashes and safe allowlist',()=>{
 const valid=archive();assert.equal(validateUpdateArchive(valid.bytes,valid).manifest.version,'9.0.0');
 assert.throws(()=>validateUpdateArchive(valid.bytes,{...valid,sha256:'a'.repeat(64)}),/SHA-256/);
 assert.throws(()=>validateUpdateArchive(valid.bytes,{...valid,version:'8.0.0'}),/版本/);
 for(const name of ['../outside','app/dist/../../../userdata/config.json','userdata/config/key.json','app/dist/CON.txt','app/dist/a:stream','app/dist/../x','app/dist/a.','app/dist/C:\\x'])assert.equal(safeUpdatePath(name),false,name);
 for(const name of ['userdata/config.json','../escape']){const bad=archive('9.0.0',{[name]:'x'});assert.throws(()=>validateUpdateArchive(bad.bytes,bad),/路径/);}
 const altered={...valid.files,'app/dist/index.html':encode('tampered')},bytes=zipSync(altered);assert.throws(()=>validateUpdateArchive(bytes,{...valid,sha256:hash(bytes)}),/校验/);
 const caseConflict=archive('9.0.0',{'app/dist/INDEX.html':'collision'});assert.throws(()=>validateUpdateArchive(caseConflict.bytes,caseConflict),/重复/);
});
test('asset download allows only bounded GitHub asset redirects, never auth or retries',async()=>{
 const calls=[];const bytes=await downloadReleaseAsset('https://github.com/owner/repo/releases/download/v9/a.zip',{expectedBytes:2,fetchImpl:async(url,init)=>{calls.push({url,init});return calls.length===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/object?signature=x'}}):new Response('OK');}});
 assert.equal(bytes.toString(),'OK');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.init.headers.Authorization===undefined&&c.init.redirect==='manual'));
 await assert.rejects(()=>downloadReleaseAsset('https://github.com/a/b',{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://evil.test/x'}})}),/域名/);
 await assert.rejects(()=>downloadReleaseAsset('http://github.com/a/b'),/无效/);
 await assert.rejects(()=>downloadReleaseAsset('https://github.com/a/b',{expectedBytes:3,fetchImpl:async()=>new Response('OK')}),/不完整/);
 let count=0;await assert.rejects(()=>downloadReleaseAsset('https://github.com/a/b',{fetchImpl:async()=>{count++;return new Response('bad',{status:503});}}),/503/);assert.equal(count,1);
});
test('two simultaneous prepares share one download and never touch installed files or data',async t=>{
 const root=await temporary(t),dataDir=path.join(root,'userdata'),fixture=archive();
 await filesTo(root,{'runtime/node.exe':'old runtime','app/scripts/apply-update.mjs':'old helper','app/server/index.mjs':'old server','启动 Lucifer FX.exe':'launcher','userdata/keep.json':'secret user state'});
 let checks=0,downloads=0;
 const service=createAppUpdater({root,dataDir,currentVersion:'1.0.0',installId:'fixture',platform:'win32',execPath:path.join(root,'runtime/node.exe'),releaseServices:{checkUpdates:async()=>{checks++;return {status:'update_available',latestVersion:fixture.version,download:{name:'Lucifer-NovelAI-FX-Share-9.0.0-Windows-x64.zip',url:'https://github.com/a/b/releases/download/v9/a.zip',sha256:fixture.sha256,bytes:fixture.bytes.length}};}},fetchImpl:async()=>{downloads++;return new Response(fixture.bytes);}});
 await Promise.all([service.prepare(),service.prepare()]);
 for(let i=0;i<100&&(await service.info()).status!=='prepared';i++)await new Promise(r=>setTimeout(r,10));
 assert.equal((await service.info()).status,'prepared');assert.equal(checks,1);assert.equal(downloads,1);
 assert.equal(await readFile(path.join(root,'app/server/index.mjs'),'utf8'),'old server');assert.equal(await readFile(path.join(dataDir,'keep.json'),'utf8'),'secret user state');
 await service.prepare();assert.equal(checks,1);
 const dev=createAppUpdater({root,dataDir,currentVersion:'1.0.0',installId:null,releaseServices:{}});await assert.rejects(()=>dev.prepare(),/开发目录/);
});
async function setupInstall(t){
 const root=await temporary(t),dataDir=path.join(root,'userdata'),transaction=path.join(dataDir,'updates','test'),fixture=archive();
 await filesTo(root,{'runtime/node.exe':'old runtime','app/server/index.mjs':'old server','app/dist/index.html':'old html','manifest.json':JSON.stringify({product:'Lucifer NovelAI FX Share',version:'1.0.0'}),'userdata/keep.json':'keep me','userdata/update.lock':'locked','custom-user-file.txt':'also keep'});
 await filesTo(path.join(transaction,'new'),fixture.files);
 return {root,dataDir,transaction,statePath:path.join(dataDir,'update-status.json'),currentVersion:'1.0.0',targetVersion:fixture.version,manifestSHA256:fixture.manifestSHA256,pid:12345,port:18988,installId:'test-install'};
}
test('actual file replacement keeps userdata and backups and verifies new version before success',async t=>{
 const plan=await setupInstall(t),checks=[];
 await applyUpdate(plan,{waitForExit:async()=>{},start:async()=>({}),verify:async(p,version)=>checks.push(version)});
 assert.deepEqual(checks,['9.0.0']);assert.equal(await readFile(path.join(plan.root,'app/server/index.mjs'),'utf8'),'new server');
 assert.equal(await readFile(path.join(plan.transaction,'backup/app/server/index.mjs'),'utf8'),'old server');
 assert.equal(await readFile(path.join(plan.dataDir,'keep.json'),'utf8'),'keep me');assert.equal(await readFile(path.join(plan.root,'custom-user-file.txt'),'utf8'),'also keep');
 assert.equal(JSON.parse(await readFile(plan.statePath)).status,'succeeded');await assert.rejects(()=>readFile(path.join(plan.dataDir,'update.lock')),{code:'ENOENT'});
});
test('failed new launch restores old application and restarts old version with userdata intact',async t=>{
 const plan=await setupInstall(t);let starts=0;const checks=[];
 await applyUpdate(plan,{waitForExit:async()=>{},start:async()=>{if(++starts===1)throw Error('Cannot start new runtime');return {};},verify:async(p,version)=>checks.push(version)});
 assert.equal(starts,2);assert.deepEqual(checks,['1.0.0']);assert.equal(JSON.parse(await readFile(plan.statePath)).status,'rolled_back');
 assert.equal(await readFile(path.join(plan.root,'app/server/index.mjs'),'utf8'),'old server');assert.equal(await readFile(path.join(plan.transaction,'failed/app/server/index.mjs'),'utf8'),'new server');assert.equal(await readFile(path.join(plan.dataDir,'keep.json'),'utf8'),'keep me');
});
test('tampered staged files abort before replacement and recover old service',async t=>{
 const plan=await setupInstall(t);await writeFile(path.join(plan.transaction,'new/app/server/index.mjs'),'tampered');let restarted=0;
 await applyUpdate(plan,{waitForExit:async()=>{},start:async()=>{restarted++;return {};},verify:async()=>{}});
 assert.equal(restarted,1);assert.equal(JSON.parse(await readFile(plan.statePath)).status,'failed');assert.equal(await readFile(path.join(plan.root,'app/server/index.mjs'),'utf8'),'old server');
});
test('server checks throttle automatic metadata reads and reject updater calls from foreign origins',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-update-test-'));let checks=0;
 const server=createStudioServer({root,dataDir:path.join(root,'userdata'),installId:'fixture',releaseRepository:'fixture/release',fetchImpl:async()=>{throw Error('No paid requests');},releaseFetchImpl:async()=>{checks++;return Response.json({tag_name:'v9.0.0',assets:[]});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));assert.ok(root.startsWith(path.join(os.tmpdir(),'fx-update-test-')));await rm(root,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;
 for(let i=0;i<2;i++)await fetch(base+'/api/check-updates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({automatic:true})});assert.equal(checks,1);
 await fetch(base+'/api/check-updates',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(checks,2);
 for(const origin of ['https://evil.test','null']){const r=await fetch(base+'/api/update/install',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-FX-Action':'update','X-FX-Install-Id':'fixture'},body:'{}'});assert.equal(r.status,403);}
 const state=await (await fetch(base+'/api/update-state')).json();assert.equal(state.supported,false);assert.ok(!JSON.stringify(state).includes(root));
});

test('every interrupted rename can be recovered from the persisted journal without lost userdata',async t=>{
 for(let interruptAt=1;interruptAt<=10;interruptAt++){
  const plan=await setupInstall(t);let moves=0;
  try{await applyUpdate(plan,{waitForExit:async()=>{},start:async()=>({}),verify:async()=>{},afterMove:async()=>{if(++moves===interruptAt)throw Object.assign(Error('power loss'),{simulatedPowerLoss:true});}});}catch(error){assert.equal(error.simulatedPowerLoss,true);}
  if(moves<interruptAt)continue;
  await unlink(path.join(plan.transaction,'helper-active.json')).catch(()=>{}); // Simulate the crashed process disappearing.
  let starts=0;await recoverUpdate(plan,{probe:async()=>null,start:async()=>{starts++;return {};},verify:async(p,v)=>assert.equal(v,'1.0.0')});
  assert.equal(starts,1);assert.equal(await readFile(path.join(plan.root,'app/server/index.mjs'),'utf8'),'old server');assert.equal(await readFile(path.join(plan.dataDir,'keep.json'),'utf8'),'keep me');assert.equal(JSON.parse(await readFile(plan.statePath)).status,'rolled_back');
 }
});

test('custom output directories cannot be hidden in replaced program trees',()=>{
 const root=path.resolve('portable');assert.doesNotThrow(()=>assertUpdateStorage(root,[path.join(root,'userdata/output'),path.resolve('external-images')]));
 for(const p of [root,path.join(root,'app/images'),path.join(root,'runtime'),path.join(root,'docs/art')])assert.throws(()=>assertUpdateStorage(root,[p]),/重叠/);
});
test('recovery refuses a still-running helper even if its host has disappeared',async t=>{
 const plan=await setupInstall(t);await writeFile(path.join(plan.transaction,'helper-active.json'),JSON.stringify({pid:process.pid}));
 await assert.rejects(()=>recoverUpdate(plan,{probe:async()=>null}),/仍在运行/);assert.equal(await readFile(path.join(plan.root,'app/server/index.mjs'),'utf8'),'old server');
});
test('late old-service recovery recognizes a complete restored version even with a journal',async t=>{
 const plan=await setupInstall(t),old=archive('1.0.0');await filesTo(plan.root,old.files);
 await writeFile(path.join(plan.transaction,'journal.json'),JSON.stringify({originals:['app','runtime','manifest.json'],phase:'applying'}));
 await recoverUpdate(plan,{probe:async()=>({shareEdition:true,installId:plan.installId,version:'1.0.0-share'}),start:async()=>{throw Error('Must not spawn duplicate old server');}});
 assert.equal(JSON.parse(await readFile(plan.statePath)).status,'rolled_back');await assert.rejects(()=>readFile(path.join(plan.dataDir,'update.lock')),{code:'ENOENT'});
});
