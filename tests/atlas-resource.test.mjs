import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasResource,ATLAS_RESOURCE_MAX_BYTES} from '../server/atlas.mjs';

const url='https://assets.quicktagcloud.com/data/releases/r-fixture/nai5_community_pack.json';

test('both community pack sizes pass the public JSON relay unchanged, including decoded compressed bodies',async()=>{
 for(const [size,compressed] of [[9381789,false],[15453910,true]]){
  const bytes=Buffer.from('{"fixture":"'+'x'.repeat(size-14)+'"}');
  assert.equal(bytes.length,size);
  let calls=0;
  const result=await atlasResource(url,{fetchImpl:async(target,options)=>{
   calls++;assert.equal(target,url);assert.equal(options.redirect,'error');
   assert.equal(options.headers.Authorization,undefined);
   // Fetch exposes a decoded body, while Content-Length can be compressed size.
   return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(compressed?1024:bytes.length)}});
  }});
  assert.deepEqual(result,bytes);assert.equal(calls,1);
 }
});

test('oversized Content-Length is rejected before reading and the body is cancelled',async()=>{
 let cancelled=false;
 const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Length':String(ATLAS_RESOURCE_MAX_BYTES+1)}});
 await assert.rejects(atlasResource(url,{fetchImpl:async()=>response}),/大小上限/);
 assert.equal(cancelled,true);
});

test('decoded stream size stays bounded without Content-Length and cancels overflow',async()=>{
 let cancelled=false,pulls=0;
 const response=new Response(new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}));
 await assert.rejects(atlasResource(url,{fetchImpl:async()=>response}),/大小上限/);
 assert.equal(cancelled,true);assert.ok(pulls<=34);
});

test('JSON validation, host/path restrictions and no-retry HTTP errors remain intact',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return new Response('unavailable',{status:503});};
 await assert.rejects(atlasResource('https://example.com/data/a.json',{fetchImpl}),/不支持/);
 await assert.rejects(atlasResource('https://assets.quicktagcloud.com/api/settings',{fetchImpl}),/不支持/);
 assert.equal(calls,0);
 await assert.rejects(atlasResource(url,{fetchImpl}),/503/);assert.equal(calls,1);
 await assert.rejects(atlasResource(url,{fetchImpl:async()=>new Response('<html>not JSON</html>')}),SyntaxError);
});
