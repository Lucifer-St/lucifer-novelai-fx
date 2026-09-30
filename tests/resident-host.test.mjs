import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {startResidentHost} from '../server/resident-host.mjs';

test('resident host launches only portable Windows, from data cache outside replaced program trees',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-resident-'));
 t.after(async()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),'fx-resident-')));await rm(root,{recursive:true,force:true});});
 const source=path.join(root,'app/dist/native');await mkdir(source,{recursive:true});await writeFile(path.join(source,'ResidentHost.exe'),'owned fixture bytes');
 const calls=[];const options={root,port:8796,installId:'test-install',platform:'win32',execPath:path.join(root,'runtime/node.exe'),disabled:false,spawnImpl:(file,args,opts)=>{calls.push({file,args,opts});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;}};
 for(const override of [{disabled:true},{platform:'linux'},{installId:null},{execPath:path.join(root,'other-node.exe')}])assert.equal(await startResidentHost({...options,...override}),false);
 assert.equal(calls.length,0);
 await Promise.all([startResidentHost(options),startResidentHost(options)]);assert.equal(calls.length,2);
 for(const call of calls){assert.equal(path.dirname(call.file),path.join(root,'userdata/desktop-host'));assert.deepEqual(call.args,[root,'8796','test-install','share']);assert.equal(await readFile(call.file,'utf8'),'owned fixture bytes');assert.equal(call.opts.detached,true);}
 assert.equal((await readdir(path.join(root,'userdata/desktop-host'))).length,1);
});
