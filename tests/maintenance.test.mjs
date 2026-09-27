import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createStudioServer} from '../server/index.mjs';
import {defaults,buildRequest} from '../src/lib/request.mjs';

const vault={seal:async value=>Buffer.from(value).toString('base64'),open:async value=>Buffer.from(value,'base64').toString()};
async function fixture(t,fetchImpl=async()=>Response.json({data:[]})){
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-maintenance-')),dataDir=path.join(root,'userdata'),installId='fixture-install';
 const server=createStudioServer({root,dataDir,installId,vault,fetchImpl});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(route,{method='GET',body,headers={}}={}){const response=await fetch(base+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};}
 return {root,dataDir,server,base,request,installId};
}

test('history pages beyond 200 using stable cursors, including when a cursor file disappears',async t=>{
 const c=await fixture(t),directory=path.join(c.dataDir,'history');await mkdir(directory,{recursive:true});
 const start=Date.UTC(2026,8,20);
 for(let i=0;i<205;i++){const id=`${start+i*1000}-${String(i).padStart(4,'0')}`;await writeFile(path.join(directory,`${id}.json`),JSON.stringify({id,n:i}));}
 const first=await c.request('/api/history?limit=200');assert.equal(first.status,200);assert.equal(first.data.entries.length,200);assert.equal(first.data.entries[0].n,204);assert.ok(first.data.nextCursor);
 await unlink(path.join(directory,`${first.data.nextCursor}.json`));
 const newest=`${start+205000}-new`;await writeFile(path.join(directory,`${newest}.json`),JSON.stringify({id:newest,n:205}));
 await writeFile(path.join(directory,`${start+4500}-broken.json`),'not JSON');
 await writeFile(path.join(directory,`${start+2500}-null.json`),'null');
 const next=await c.request('/api/history?before='+encodeURIComponent(first.data.nextCursor));assert.deepEqual(next.data.entries.map(entry=>entry.n),[4,3,2,1,0]);assert.equal(next.data.nextCursor,null);
 const malformed=await c.request('/api/history?before=..%2Fsecret');assert.equal(malformed.status,400);
});

test('backup restore is idempotent, merge preserves edited IDs, preferences mode changes no server data',async t=>{
 const c=await fixture(t),id=randomUUID();
 const created=await c.request('/api/library',{method:'POST',body:{id,kind:'snippet',title:'my card',text:'custom content'}});assert.equal(created.status,200);
 const original=await c.request('/api/backup');const count=(await c.request('/api/library')).data.entries.length;
 const preview=await c.request('/api/backup/preview',{method:'POST',body:{backup:original.data,mode:'restore'}});assert.equal(preview.data.added,0);assert.equal(preview.data.skipped,count);
 const again=await c.request('/api/backup',{method:'POST',body:{backup:original.data,mode:'restore'}});assert.equal(again.data.added,0);assert.equal((await c.request('/api/library')).data.entries.length,count);
 const edited=await c.request('/api/library',{method:'POST',body:{...created.data,title:'locally edited'}});assert.equal(edited.status,200);
 const restore=await c.request('/api/backup',{method:'POST',body:{backup:original.data,mode:'restore'}});assert.equal(restore.data.conflicts,1);assert.equal((await c.request('/api/library/'+id)).data.title,'locally edited');
 const merged=await c.request('/api/backup',{method:'POST',body:{backup:original.data,mode:'merge'}});assert.equal(merged.data.added,1);assert.equal((await c.request('/api/backup',{method:'POST',body:{backup:original.data,mode:'merge'}})).data.added,0);
 const before=(await c.request('/api/settings')).data,afterCount=(await c.request('/api/library')).data.entries.length;
 const prefs={...original.data,preferences:{'lucifer-fx-appearance-v1':'test',unknown:'not restored'}};
 const prefPreview=await c.request('/api/backup/preview',{method:'POST',body:{backup:prefs,mode:'preferences'}});assert.equal(prefPreview.data.preferencesAvailable,1);assert.equal(prefPreview.data.added,0);
 const preferenceOnly=await c.request('/api/backup',{method:'POST',body:{backup:prefs,mode:'preferences'}});assert.equal(preferenceOnly.status,200);assert.deepEqual((await c.request('/api/settings')).data,before);assert.equal((await c.request('/api/library')).data.entries.length,afterCount);
});

test('shutdown rejects wrong origin, missing action header and active generation; then closes owned server',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const c=await fixture(t,async(url,init)=>{if(init.method==='POST'){await gate;return Response.json({images:[]});}return Response.json({data:[]});});
 const body={},valid={Origin:c.base,'X-FX-Action':'shutdown','X-FX-Install-Id':c.installId};
 assert.equal((await c.request('/api/shutdown',{method:'POST',body,headers:{...valid,Origin:'https://elsewhere.example'}})).status,403);
 assert.equal((await c.request('/api/shutdown',{method:'POST',body,headers:{Origin:c.base,'X-FX-Install-Id':c.installId}})).status,403);
 await c.request('/api/settings',{method:'POST',body:{key:'fixture-key'}});
 const job=await c.request('/api/generation-jobs',{method:'POST',body:{clientRequestId:randomUUID(),payload:buildRequest({...defaults(),prompt:'fixture',seed:42})}});assert.equal(job.status,202);
 let busy=false;for(let i=0;i<100;i++){const status=await c.request('/api/status');if(status.data.generationBusy||['queued','running','stopping'].includes(status.data.activeGeneration?.status)){busy=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(busy,true);
 assert.equal((await c.request('/api/shutdown',{method:'POST',body,headers:valid})).status,409);
 release();
 for(let i=0;i<100;i++){const status=await c.request('/api/status');if(!status.data.activeGeneration&&status.data.generationBusy===false)break;await new Promise(resolve=>setTimeout(resolve,10));}
 const closed=new Promise(resolve=>c.server.once('close',resolve));
 const stopped=await c.request('/api/shutdown',{method:'POST',body,headers:valid});assert.equal(stopped.status,200,JSON.stringify(stopped.data));
 await closed;assert.equal(c.server.listening,false);
});
