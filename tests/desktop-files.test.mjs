import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createDesktopFiles,validateLocalPath} from '../server/desktop-files.mjs';
import {createStudioServer} from '../server/index.mjs';

test('native folder actions preserve Unicode and cancel, serialize pickers, and pass paths as data',{timeout:10000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-desktop-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const helper=path.join(root,'helper.exe');await writeFile(helper,'fixture');const seen=[];let finish,notifyStarted;const started=new Promise(resolve=>{notifyStarted=resolve;});
 const files=createDesktopFiles({platform:'win32',cacheDir:root,helperPath:helper,runImpl:async input=>{seen.push(input);if(input.action==='choose')return new Promise(r=>{finish=r;notifyStarted();});return {ok:true};}});
 const folder=path.join(root,"中文 O'Brien & 空格");const choosing=files.choose(folder);await Promise.race([started,choosing.then(()=>assert.fail('picker must remain pending'))]);
 await assert.rejects(()=>files.choose(folder),/已有目录选择/);finish({ok:true,cancelled:true,path:null});assert.equal((await choosing).cancelled,true);
 await files.open(folder);await writeFile(path.join(folder,'图片.png'),'fixture');await files.reveal(path.join(folder,'图片.png'));
 assert.deepEqual(seen.map(x=>x.action),['choose','open','reveal']);assert.equal(seen[0].path,folder);assert.equal(seen[2].path,path.join(folder,'图片.png'));
 for(const invalid of ['https://example.com','relative','C:\\folder\u0000bad'])assert.throws(()=>validateLocalPath(invalid));
});

test('desktop routes reject foreign actions and resolve only known folders or persisted image IDs',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-desktop-routes-')),data=path.join(root,'data'),seen=[];
 const server=createStudioServer({root,dataDir:data,outputDir:path.join(root,'output'),saveDir:path.join(root,'saved'),fetchImpl:async()=>{throw Error('No network');},desktopFiles:{choose:async p=>{seen.push(['choose',p]);return {ok:true,path:null,cancelled:true};},open:async p=>{seen.push(['open',p]);return {ok:true};},reveal:async p=>{seen.push(['reveal',p]);return {ok:true};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;
 const send=(route,body,origin=base,action='local-files')=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-FX-Action':action},body:JSON.stringify(body)});
 assert.equal((await send('/api/storage/open',{kind:'output'},'https://evil.test')).status,403);assert.equal((await send('/api/storage/open',{kind:'output'},base,'wrong')).status,403);assert.equal(seen.length,0);
 const picked=await send('/api/storage/directory',{kind:'outputDirectory',initialPath:path.join(root,'中文 目录')});assert.equal(picked.status,200);assert.equal((await picked.json()).cancelled,true);
 assert.equal((await send('/api/storage/open',{kind:'output',path:'C:\\Windows\\cmd.exe'})).status,200);assert.equal(seen.at(-1)[1],path.join(root,'output'));
 assert.equal((await send('/api/storage/open',{kind:'image',id:'../outside',index:0})).status,400);
 const id='1700000000000-abcd1234',name=id+'-0.png';await mkdir(path.join(data,'history'),{recursive:true});await mkdir(path.join(data,'results'),{recursive:true});await writeFile(path.join(data,'results',name),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64'));await writeFile(path.join(data,'history',id+'.json'),JSON.stringify({id,images:[{name,url:'/api/results/'+name}]}));
 assert.equal((await send('/api/storage/open',{kind:'image',id,index:0})).status,200);assert.equal(seen.at(-1)[1],path.join(data,'results',name));
 assert.equal((await send('/api/storage/open',{kind:'image',id,index:99})).status,400);
 // A half-written POST is still an in-flight mutation: changing directories must not race it.
 const held=http.request(base+'/api/library',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'100'}},r=>r.resume());held.on('error',()=>{});held.write('{');await new Promise(r=>setTimeout(r,30));
 const share=(await (await fetch(base+'/api/status')).json()).shareEdition;
 const change=await send(share?'/api/settings':'/api/storage',{outputDirectory:path.join(root,'new-output')});assert.equal(change.status,409);held.destroy();
});
