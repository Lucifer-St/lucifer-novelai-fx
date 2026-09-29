import test from 'node:test';import assert from 'node:assert/strict';import {readFile,stat,writeFile} from 'node:fs/promises';import path from 'node:path';
import {studioFixture,eventually} from './fixtures/studio.mjs';import {defaults,buildRequest} from '../src/lib/request.mjs';
const key=entry=>entry.id+':0';
async function generateRows(f,n){const rows=[];for(let i=0;i<n;i++){const r=await f.request('/api/request',{payload:buildRequest({...defaults(),prompt:'fixture garden '+i,seed:i+42})});assert.equal(r.status,200,JSON.stringify(r.data));rows.push(r.data);}await eventually(()=>f.request('/api/generated-library'),r=>r.data.items.length===n);return rows;}
test('cleanup protects favorites/saved files, previews actual bytes, removes index entries, restores and permanently empties trash',async t=>{
 const f=await studioFixture(t),rows=await generateRows(f,3);await f.request('/api/generated-library/annotation',{id:rows[0].id,index:0,favorite:true},'PATCH');await f.request('/api/save-result',{id:rows[1].id,index:0});
 const preview=await f.request('/api/generated-library/cleanup/preview',{keys:rows.map(key)});assert.equal(preview.status,200);assert.equal(preview.data.count,1);assert.equal(preview.data.protectedCount,2);assert.ok(preview.data.bytes>0);
 const before=await readFile(rows[2].images[0].outputPath);const result=await f.request('/api/generated-library/cleanup/execute',{token:preview.data.token});assert.equal(result.status,200,JSON.stringify(result.data));await assert.rejects(stat(rows[2].images[0].outputPath),{code:'ENOENT'});assert.equal((await f.request('/api/generated-library')).data.items.length,2);assert.equal((await fetch(f.base+rows[2].images[0].url)).status,404);
 assert.equal((await f.request('/api/generated-library/cleanup/restore',{id:result.data.id})).status,200);assert.deepEqual(await readFile(rows[2].images[0].outputPath),before);assert.equal((await f.request('/api/generated-library')).data.items.length,3);
 const second=await f.request('/api/generated-library/cleanup/preview',{keys:[key(rows[2])]});await f.request('/api/generated-library/cleanup/execute',{token:second.data.token});assert.equal((await f.request('/api/generated-library/cleanup/purge',{})).status,400);assert.equal((await f.request('/api/generated-library/cleanup/purge',{confirm:true})).status,200);
 assert.equal((await f.request('/api/generated-library/cleanup/trash')).data.entries.length,0);assert.ok((await stat(rows[0].images[0].outputPath)).isFile());assert.ok((await stat(rows[1].images[0].outputPath)).isFile());await f.restart();assert.equal((await f.request('/api/generated-library')).data.items.length,2);
});
test('changed protection invalidates preview; raw paths cannot be supplied; configured oldest-first cap protects favorites',async t=>{
 const f=await studioFixture(t,{cleanupIntervalMs:80}),rows=await generateRows(f,4);const preview=await f.request('/api/generated-library/cleanup/preview',{keys:[key(rows[0])]});await f.request('/api/generated-library/annotation',{id:rows[0].id,index:0,favorite:true},'PATCH');assert.equal((await f.request('/api/generated-library/cleanup/execute',{token:preview.data.token})).status,409);
 assert.equal((await f.request('/api/generated-library/cleanup/preview',{keys:['../../fixture.key']})).status,409);
 assert.equal((await f.request('/api/generated-library/cleanup/settings')).data.maxImages,0);assert.equal((await f.request('/api/generated-library/cleanup/settings',{maxImages:2})).status,200);
 const remaining=await eventually(()=>f.request('/api/generated-library'),r=>r.data.items.length===2);assert.deepEqual(new Set(remaining.data.items.map(r=>r.result_id)),new Set([rows[0].id,rows[3].id]));
 assert.equal((await f.request('/api/generated-library/cleanup/settings',{maxImages:-1})).status,409);
});
test('group selection covers pages, supports exact hand tags, and rebuilding cannot resurrect deleted images',async t=>{
 const f=await studioFixture(t),rows=await generateRows(f,3);for(const row of rows)await f.request('/api/generated-library/annotation',{id:row.id,index:0,tags:['风景']},'PATCH');
 const grouped=await f.request('/api/generated-library/groups?groupBy=tag');assert.equal(grouped.data.groups.find(g=>g.label==='风景').count,3);const selection=await f.request('/api/generated-library/select',{groupBy:'tag',groupValue:'tag:风景'});assert.equal(selection.data.items.length,3);
 const p=await f.request('/api/generated-library/cleanup/preview',{keys:rows.map(key)});await f.request('/api/generated-library/cleanup/execute',{token:p.data.token});await f.request('/api/generated-library/rebuild',{});await eventually(()=>f.request('/api/generated-library/status'),r=>!r.data.running);assert.equal((await f.request('/api/generated-library')).data.items.length,0);
});

test('cleanup covers internal cache, preserves a protected sibling and its shared response, and rejects changed files',async t=>{
 const f=await studioFixture(t,{fetchImpl:async()=>Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII='},{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII='}]})});
 const share=(await import('../package.json',{with:{type:'json'}})).default.name.endsWith('-share');await f.request(share?'/api/settings':'/api/storage',{autoSaveOutput:false});
 const entry=(await f.request('/api/request',{payload:buildRequest({...defaults(),prompt:'two fixtures',seed:42,n:2})})).data;await eventually(()=>f.request('/api/generated-library/status'),r=>r.data.indexed===2);await f.request('/api/save-result',{id:entry.id,index:1});
 const p=await f.request('/api/generated-library/cleanup/preview',{keys:[entry.id+':0',entry.id+':1']});assert.equal(p.data.count,1);assert.equal(p.data.protectedCount,1);const d=await f.request('/api/generated-library/cleanup/execute',{token:p.data.token});assert.equal(d.status,200);assert.equal((await fetch(f.base+entry.images[0].url)).status,404);assert.equal((await fetch(f.base+entry.images[1].url)).status,200);assert.equal((await fetch(f.base+entry.rawUrl)).status,200);await f.restart();assert.equal((await f.request('/api/generated-library/cleanup/restore',{id:d.data.id})).status,200);
 const next=await f.request('/api/generated-library/cleanup/preview',{keys:[entry.id+':0']});const file=path.join(f.dataDir,'results',entry.images[0].name);await writeFile(file,'changed by fixture');assert.equal((await f.request('/api/generated-library/cleanup/execute',{token:next.data.token})).status,409);assert.equal(await readFile(file,'utf8'),'changed by fixture');
});

test('expiry reclaims confirmed trash even when automatic count cleanup is disabled',async t=>{
 const f=await studioFixture(t,{cleanupIntervalMs:80}),[entry]=await generateRows(f,1);const p=await f.request('/api/generated-library/cleanup/preview',{keys:[key(entry)]});const removed=await f.request('/api/generated-library/cleanup/execute',{token:p.data.token});
 const recordPath=path.join(f.dataDir,'library-cleanup',removed.data.id+'.json'),record=JSON.parse(await readFile(recordPath,'utf8'));record.expiresAt='2000-01-01T00:00:00.000Z';await writeFile(recordPath,JSON.stringify(record));
 // Exercise the same expiry worker with an isolated server interval after restart.
 await f.restart();await eventually(()=>f.request('/api/generated-library/cleanup/trash'),r=>r.data.entries.length===0);
});

test('a concurrent generation prevents executing deletion and does not consume the preview',async t=>{
 let hold=false,release;const f=await studioFixture(t,{fetchImpl:async()=>{if(hold)await new Promise(resolve=>release=resolve);return Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII='}]});}}),[entry]=await generateRows(f,1);
 const preview=await f.request('/api/generated-library/cleanup/preview',{keys:[key(entry)]});hold=true;const pending=f.request('/api/request',{payload:buildRequest({...defaults(),prompt:'busy fixture',seed:100})});await eventually(()=>Promise.resolve(!!release),Boolean);
 try{assert.equal((await f.request('/api/generated-library/cleanup/execute',{token:preview.data.token})).status,409);assert.ok((await stat(entry.images[0].outputPath)).isFile());}finally{release();await pending;}
 assert.equal((await f.request('/api/generated-library/cleanup/execute',{token:preview.data.token})).status,200);
});
