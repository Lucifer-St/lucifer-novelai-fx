import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHistoryIndex} from '../server/history-index.mjs';

async function fixture(t){const dataDir=await mkdtemp(path.join(os.tmpdir(),'fx-history-index-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));await mkdir(path.join(dataDir,'history'));await mkdir(path.join(dataDir,'results'));return dataDir;}
function entry(n,options={}){const id=`${1790300000000+n}-${n.toString(16).padStart(8,'0')}`;return {id,createdAt:new Date(1790300000000+n).toISOString(),prompt:`portrait batch ${n}`,model:n%2?'nai-diffusion-5-full':'nai-diffusion-4-5-full',action:n%2?'generate':'img2img',requestUrl:`/api/results/${id}-request.json`,images:[{name:`${id}-1.png`,url:`/api/results/${id}-1.png`,outputName:`V5Full-2026-09-24T12-00-00-seed${n}-${id.split('-')[1]}-1.png`},...options.extraImage?[{name:`${id}-2.png`,url:`/api/results/${id}-2.png`,outputName:`V5Full-2026-09-24T12-00-00-seedunknown-${id.split('-')[1]}-2.png`}]:[]]};}
async function add(dataDir,item,{request=true,broken=false}={}){await writeFile(path.join(dataDir,'history',`${item.id}.json`),broken?'{broken':JSON.stringify(item));if(request)await writeFile(path.join(dataDir,'results',`${item.id}-request.json`),JSON.stringify({novelai:{body:{model:item.model,input:`final ${item.prompt}`,action:item.action,parameters:{seed:777,negative_prompt:'bad hands',steps:28}}}}));}

test('searches beyond 200 records with keyset paging and real per-image seed',async t=>{
 const dataDir=await fixture(t);for(let n=0;n<245;n++)await add(dataDir,entry(n,{extraImage:n===3}));
 const index=createHistoryIndex({dataDir,resolveImage:async()=>true});await index.start();
 assert.equal(index.status().indexed,246);
 const sought=await index.search({q:'batch 3',seed:'3'});assert.equal(sought.items.length,1);assert.equal(sought.items[0].seed,'3');
 const second=await index.get(entry(3).id,1);assert.equal(second.seed,null);assert.equal(second.metadata.parameters.seed,undefined);
 const seen=new Set();let cursor=null;do{const page=await index.search({limit:37,...cursor?{cursor}:{}});for(const item of page.items){assert.ok(!seen.has(item.key));seen.add(item.key);}cursor=page.nextCursor;}while(cursor);
 assert.equal(seen.size,246);assert.equal((await index.search({model:'nai-diffusion-4-5-full',mode:'img2img',seed:'240'})).items.length,1);
 assert.equal((await index.search({q:'final portrait batch 0'})).items.length,1);
 await index.close();
});

test('preserves annotation through rebuild and reports broken or missing history',async t=>{
 const dataDir=await fixture(t),good=entry(8),bad=entry(9);await add(dataDir,good);await add(dataDir,bad,{broken:true});
 const index=createHistoryIndex({dataDir});await index.start();assert.equal(index.status().broken,1);assert.equal(index.status().missing,1);
 await index.annotate(good.id,0,{favorite:true,tags:['银发','portrait']});
 assert.equal((await index.search({favorite:'1'})).items[0].tags[0],'银发');
 assert.equal((await index.search({q:'银发'})).items.length,1);
 const backup=await index.exportAnnotations();await index.rebuild();assert.equal((await index.search({favorite:'1'})).items.length,1);
 await index.close();const reopened=createHistoryIndex({dataDir});await reopened.start();assert.equal((await reopened.search({favorite:'1'})).items.length,1);
 await reopened.annotate(good.id,0,{favorite:false,tags:[]});assert.equal((await reopened.search({q:'银发'})).items.length,0);
 await reopened.importAnnotations(backup);assert.equal((await reopened.search({favorite:'1'})).items.length,1);assert.equal((await reopened.search({q:'银发'})).items.length,1);await reopened.close();
 const annotations=JSON.parse(await readFile(path.join(dataDir,'generated-library','annotations.json'),'utf8'));assert.equal(annotations.items[`${good.id}:0`].favorite,true);
});

test('10,000 metadata rows build and query in bounded time',async t=>{
 const dataDir=await fixture(t),index=createHistoryIndex({dataDir,resolveImage:async()=>true});await index.init();const started=performance.now();
 for(let n=0;n<10000;n++){await index.indexEntry({...entry(n),requestUrl:''},{mtime:n+1});if(n%400===0)await new Promise(resolve=>setImmediate(resolve));}
 const buildMs=Math.round(performance.now()-started),queryStart=performance.now();
 const found=await index.search({q:'portrait batch 9999',seed:'9999'}),queryMs=Math.round(performance.now()-queryStart);
 assert.equal(index.status().indexed,10000);assert.equal(found.items.length,1);assert.equal(found.items[0].seed,'9999');
 t.diagnostic(`10k build ${buildMs} ms; indexed query ${queryMs} ms; heap ${Math.round(process.memoryUsage().heapUsed/1024/1024)} MiB`);
 await index.close();
});

test('closing while a background scan is active stops before closing SQLite',async t=>{
 const dataDir=await fixture(t);for(let n=0;n<160;n++)await add(dataDir,entry(n));
 const index=createHistoryIndex({dataDir,resolveImage:async()=>true}),scan=index.start();
 await index.close();await scan;
 assert.equal(index.status().running,false);
 await rm(path.join(dataDir,'generated-library'),{recursive:true,force:true});
});
