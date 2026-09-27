import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createAnlas}from'../server/anlas.mjs';import{defaults,buildRequest}from'../src/lib/request.mjs';
import{validateAtlasImage,validateAtlasResource,atlasOriginal}from'../server/atlas.mjs';
import{createMcpHandler,MCP_TOOLS}from'../scripts/fx-mcp.mjs';
test('ledger counts the first result and preserves accumulation across recreated stores; reset requires confirmation',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fx-ledger-update-')),ledger=createAnlas(dir),payload=buildRequest({...defaults(),prompt:'garden',seed:42,steps:35});
 await ledger.update({action:'pricingPolicy',value:'paid'});await ledger.update({action:'balance',amount:1000});
 await ledger.record({id:'fixture-first',createdAt:new Date().toISOString()},payload);const before=await ledger.get();assert.ok(before.sessionTotal>0);
 const restored=createAnlas(dir);assert.equal((await restored.get()).sessionTotal,before.sessionTotal);await assert.rejects(restored.update({action:'session'}),/确认/);assert.equal((await restored.get()).sessionTotal,before.sessionTotal);
 await new Promise(r=>setTimeout(r,5));const reset=await restored.update({action:'session',confirmReset:true});assert.equal(reset.sessionTotal,0);assert.equal(reset.entries.length,1);assert.equal(reset.balance,1000);assert.equal(reset.estimatedBalance,before.estimatedBalance);assert.equal((await createAnlas(dir).get()).sessionTotal,0);
});
test('PGR survives request building and atlas import accepts only exact HTTPS hosts and image types',()=>{
 assert.equal(buildRequest({...defaults(),prompt:'garden',cfg_rescale:.67}).novelai.body.parameters.cfg_rescale,.67);
 assert.equal(validateAtlasImage('https://assets.quicktagcloud.com/originals/garden.png'),'https://assets.quicktagcloud.com/originals/garden.png');
 for(const url of ['http://assets.quicktagcloud.com/a.png','https://evil.test/a.png','https://assets.quicktagcloud.com.evil.test/a.png','https://user:pw@assets.quicktagcloud.com/a.png','https://assets.quicktagcloud.com/a.svg','https://assets.quicktagcloud.com:444/a.png'])assert.throws(()=>validateAtlasImage(url));
 for(const url of ['https://assets.quicktagcloud.com/private.json','https://novelai.quicktagcloud.com/api/settings','https://assets.quicktagcloud.com/data/a.json?x=1'])assert.throws(()=>validateAtlasResource(url));
 assert.ok(validateAtlasResource('https://assets.quicktagcloud.com/data/releases/r-abc/codexes.json'));
});
test('atlas original retains exact PNG bytes and metadata, rejects HTML or excessive size',async()=>{
 const image=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('fixture exact source metadata')]);
 const result=await atlasOriginal('https://assets.quicktagcloud.com/original/garden.png',{fetchImpl:async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);return new Response(image,{headers:{'content-type':'image/png'}});}});assert.deepEqual(result.bytes,image);
 await assert.rejects(atlasOriginal('https://assets.quicktagcloud.com/a.png',{fetchImpl:async()=>new Response('<html>error</html>')}),/有效图片/);
 await assert.rejects(atlasOriginal('https://assets.quicktagcloud.com/a.png',{fetchImpl:async()=>new Response(image,{headers:{'content-length':String(33*1024*1024)}})}),/大小上限/);
});
test('MCP negotiates initialization, lists tools and plans offline; a failed paid submission is never retried',async()=>{
 let calls=[];const handler=createMcpHandler({port:18930,fetchImpl:async(url,init)=>{calls.push({url,init});if(url.endsWith('/api/status'))return Response.json({app:'Lucifer NovelAI FX',generationJobs:true});throw Error('response lost');}});
 const request=(id,method,params)=>handler({jsonrpc:'2.0',id,method,params});
 assert.equal((await request(0,'tools/list')).error.code,-32002);
 assert.equal((await request(1,'initialize',{protocolVersion:'2025-11-25'})).result.protocolVersion,'2025-11-25');
 assert.equal((await request(2,'tools/list')).result.tools.length,MCP_TOOLS.length);
 const planned=(await request(3,'tools/call',{name:'fx_plan',arguments:{state:{prompt:'quiet garden',seed:42,cfg_rescale:.6}}})).result;assert.equal(planned.isError,false);assert.equal(calls.length,0);
 const plan=JSON.parse(planned.content[0].text);assert.equal(plan.payload.novelai.body.parameters.cfg_rescale,.6);assert.equal(plan.payload.novelai.body.parameters.seed,42);
 const random=(await request(31,'tools/call',{name:'fx_plan',arguments:{state:{prompt:'garden',seed:-1}}})).result;assert.equal(random.isError,false);assert.ok(JSON.parse(random.content[0].text).payload.novelai.body.parameters.seed>=0);
 const failed=(await request(4,'tools/call',{name:'fx_generate',arguments:{plan}})).result;assert.equal(failed.isError,true);assert.match(failed.content[0].text,new RegExp(plan.clientRequestId));assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
 assert.equal((await request(5,'tools/call',{name:'fx_defaults',arguments:{unexpected:true}})).result.isError,true);
});
