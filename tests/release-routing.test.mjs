import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {RELEASE_CONFIG} from '../shared/release-config.mjs';
import {createStudioServer} from '../server/index.mjs';

test('release routes remain independent of startup, workbench reads and configured provider credentials',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-release-route-'));let releaseCalls=0,finish,started;
 const began=new Promise(r=>started=r);
 const server=createStudioServer({root,dataDir:root,releaseRepository:'fixture-owner/fixture-release',
  fetchImpl:async()=>{throw Error('Generation network must not run');},
  releaseFetchImpl:async(url,init)=>{releaseCalls++;assert.equal(init.headers.Authorization,undefined);started();await new Promise(r=>finish=r);return Response.json({tag_name:'v'+(Number(RELEASE_CONFIG.version.split('.')[0])+1)+'.0.0',draft:false,prerelease:false,body:'Public fixture notes',assets:[]});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{finish?.();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const info=await(await fetch(base+'/api/release-info')).json();assert.equal(info.status,'not_checked');assert.equal(releaseCalls,0);
 const checking=fetch(base+'/api/check-updates',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 await began;
 const status=await(await fetch(base+'/api/status')).json();assert.equal(status.generationBusy,false);
 const library=await(await fetch(base+'/api/library')).json();assert.equal(library.entries.length,3);assert.ok(library.entries.every(e=>e.kind==='snippet'));
 finish();const update=await(await checking).json();assert.equal(update.status,'update_available');assert.equal(releaseCalls,1);
 assert.ok(!JSON.stringify(update).includes(root));
});

test('unconfigured update route stays offline and rejects oversized POST payloads',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-release-unconfigured-'));let calls=0;
 const server=createStudioServer({root,dataDir:root,releaseRepository:null,fetchImpl:async()=>{throw Error('No upstream');},releaseFetchImpl:async()=>{calls++;throw Error('Must stay offline');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});
 const response=await fetch(base+'/api/check-updates',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal((await response.json()).status,'unconfigured');assert.equal(calls,0);
 const large=await fetch(base+'/api/check-updates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(1100)})});
 assert.equal(large.status,413);assert.equal(calls,0);
});
