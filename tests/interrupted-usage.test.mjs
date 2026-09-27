import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm}from'node:fs/promises';import os from'node:os';import path from'node:path';
import {createLocalStore}from'../server/local-store.mjs';import {createAnlas}from'../server/anlas.mjs';import{recoverInterruptedUsage}from'../server/interrupted-usage.mjs';
import {summarizeUsage} from '../src/lib/opus-usage.mjs';
test('recovery counts uncertain submissions once and excludes queued and confirmed batch slots',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'fx-recovery-'));t.after(()=>rm(root,{recursive:true,force:true}));const createdAt=new Date().toISOString();
 await createLocalStore(path.join(root,'generation-jobs')).write('a.json',{id:'a',createdAt,status:'interrupted',batch:{items:[{status:'success'},{status:'unknown'},{status:'not_submitted'}]}});
 await createLocalStore(path.join(root,'comparisons')).write('b.json',{id:'b',createdAt,status:'interrupted',jobs:[{status:'unknown'},{status:'not_submitted'}]});
 const anlas=createAnlas(path.join(root,'usage'));await recoverInterruptedUsage(root,anlas);await recoverInterruptedUsage(root,anlas);const entries=await anlas.usageEntries();assert.equal(entries.length,2);assert.ok(entries.every(e=>e.billingUnknown&&e.opusPercent===null));assert.equal((await anlas.get()).sessionTotal,0);assert.equal(summarizeUsage(entries,{timeZone:'UTC'}).uncertainRequests,2);
});
