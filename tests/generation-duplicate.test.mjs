import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {studioFixture,eventually,PNG} from './fixtures/studio.mjs';import {defaults,buildRequest} from '../src/lib/request.mjs';import {generationFingerprint} from '../server/generation-duplicate.mjs';
const payload=seed=>buildRequest({...defaults(),prompt:'fixture garden',seed});
test('duplicate workbench request is blocked before upstream, survives restart, and compares the last success only',async t=>{
 const f=await studioFixture(t);const post=p=>f.request('/api/request',{payload:p,preventDuplicate:true});
 assert.equal((await post(payload(42))).status,200);const duplicate=await post(payload(42));assert.equal(duplicate.status,409);assert.equal(duplicate.data.error.code,'duplicate_generation');assert.equal(f.requests,1);
 await f.restart();assert.equal((await post(payload(42))).status,409);assert.equal((await post(payload(43))).status,200);assert.equal((await post(payload(42))).status,200);assert.equal(f.requests,3);
 const changed=payload(42);changed.novelai.body.parameters.scale+=.1;assert.equal((await post(changed)).status,200);
});
test('failed and missing-image requests never advance the duplicate checkpoint; parameter ordering is irrelevant',async t=>{
 let mode='success';const f=await studioFixture(t,{fetchImpl:async()=>mode==='failure'?Response.json({error:{message:'fixture failure'}},{status:400}):mode==='empty'?Response.json({data:[]}):Response.json({data:[{b64_json:PNG.toString('base64')}]})});
 const post=p=>f.request('/api/request',{payload:p,preventDuplicate:true});await post(payload(42));mode='failure';await post(payload(43));mode='empty';await post(payload(44));mode='success';assert.equal((await post(payload(42))).status,409);assert.equal((await post(payload(43))).status,200);
 const reversed=payload(43);reversed.novelai.body.parameters=Object.fromEntries(Object.entries(reversed.novelai.body.parameters).reverse());assert.equal((await post(reversed)).status,409);
});
test('new job IDs cannot bypass workbench guard; existing job receipt remains idempotent',async t=>{
 const f=await studioFixture(t),first={clientRequestId:randomUUID(),payload:payload(42),preventDuplicate:true};await f.request('/api/generation-jobs',first);
 async function done(id){return eventually(async()=>({job:(await f.request('/api/generation-jobs/'+id)).data,status:(await f.request('/api/status')).data}),x=>!x.status.activeGeneration&&['success','error'].includes(x.job.status));}
 assert.equal((await done(first.clientRequestId)).job.status,'success');assert.equal((await f.request('/api/generation-jobs',first)).data.status,'success');assert.equal(f.requests,1);
 const next={...first,clientRequestId:randomUUID()};await f.request('/api/generation-jobs',next);assert.equal((await done(next.clientRequestId)).job.error.code,'duplicate_generation');assert.equal(f.requests,1);
});
test('comparison includes references, negative/role prompts and every effective parameter; unresolved random is not identical',()=>{
 const p=payload(42),endpoint=p.novelai.endpoint,base=generationFingerprint(p,endpoint);
 for(const patch of [p=>p.input+='x',p=>p.parameters.negative_prompt+='x',p=>p.parameters.seed++,p=>p.parameters.width+=64,p=>p.parameters.image='fixture-image',p=>p.parameters.director_reference_images=['fixture-reference'],p=>p.parameters.v4_prompt.caption.char_captions=[{char_caption:'new role',centers:[{x:.5,y:.5}]}]]){const changed=structuredClone(p);patch(changed.novelai.body);assert.notEqual(generationFingerprint(changed,endpoint),base);}
 p.novelai.body.parameters.seed=-1;assert.equal(generationFingerprint(p,endpoint),null);
});
