import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,readFile}from'node:fs/promises';import os from'node:os';import path from'node:path';import vm from'node:vm';
import{createAtlasStorage}from'../server/atlas-storage.mjs';import{atlasDocument}from'../src/lib/atlas-embed.mjs';
test('atlas preference writes persist across store recreation and concurrent patches without touching other data',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fx-atlas-storage-')),store=createAtlasStorage(dir);await Promise.all([store.update({action:'set',key:'fadian-theme',value:'rose'}),store.update({action:'set',key:'fadian-density',value:'compact'}),store.update({action:'set',key:'fadian-dark-mode',value:'dark'})]);
 assert.deepEqual({...await createAtlasStorage(dir).read()},{'fadian-theme':'rose','fadian-density':'compact','fadian-dark-mode':'dark'});
 await store.update({action:'remove',key:'fadian-density'});assert.equal((await store.read())['fadian-density'],undefined);
 const before=await readFile(path.join(dir,'browser-storage.json'),'utf8');await assert.rejects(store.update({action:'set',key:'__proto__',value:'x'}));await assert.rejects(store.update({action:'set',key:'bad',value:8}));await assert.rejects(store.update({action:'set',key:'large',value:'x'.repeat(2*1024*1024+1)}));assert.equal(await readFile(path.join(dir,'browser-storage.json'),'utf8'),before);
 await store.update({action:'replace',items:{'fadian-font':'serif'}});assert.deepEqual({...await store.read()},{'fadian-font':'serif'});await store.update({action:'clear'});assert.deepEqual({...await store.read()},{});
});
test('iframe has its saved preferences before upstream code, escapes scripts/dollars, and persists only its local storage',()=>{
 const seeded={'fadian-theme':'rose','fadian-note':'</script><script>throw 1</script> $& $` $\' \u2028'},html=atlasDocument('<html><head></head><body></body></html>',seeded),events=[],listeners={};
 assert.equal((html.match(/<script>/g)||[]).length,1);assert.ok(!html.includes('__LUCIFER_ATLAS_STORAGE__'));
 const sandbox={Map,Object,String,Response,URL,crypto:{randomUUID:()=> 'fixture'},parent:{postMessage:(value)=>events.push(value)},fetch:()=>{},document:{baseURI:'https://novelai.quicktagcloud.com/'},history:{pushState(){},replaceState(){}},addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),setTimeout,clearTimeout};sandbox.window=sandbox;
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],sandbox);
 assert.equal(sandbox.localStorage.getItem('fadian-theme'),'rose');assert.equal(sandbox.localStorage.getItem('fadian-note'),seeded['fadian-note']);assert.equal(events.length,0);
 sandbox.localStorage.setItem('fadian-theme','mint');sandbox.localStorage.setItem('fadian-theme','mint');sandbox.sessionStorage.setItem('temporary','1');assert.equal(events.length,1);assert.equal(events[0].operation.value,'mint');
 for(const fn of listeners.message)fn({source:sandbox.parent,origin:'http://127.0.0.1:8790',data:{type:'lucifer-atlas-storage-snapshot-request',id:'snapshot'}});assert.equal(events.at(-1).items['fadian-theme'],'mint');assert.equal(events.at(-1).items.temporary,undefined);
});
