import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';
import {createGatewayTransport,GATEWAY_AGENT_OPTIONS,GENERATION_TIMEOUT_MS,GATEWAY_CONNECT_TIMEOUT_MS} from '../server/gateway-transport.mjs';
test('gateway transport is finite, single-dispatch, HTTP/1.1 and does not follow credential redirects',async t=>{
 let calls=0,version;const server=http.createServer((req,res)=>{calls++;version=req.httpVersion;req.resume();if(req.url==='/redirect'){res.writeHead(307,{location:'https://unrelated.invalid/'});res.end();}else if(req.url==='/reset')req.socket.destroy();else res.end('ok');});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port,client=createGatewayTransport({origin});t.after(async()=>{await client.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 assert.equal(GENERATION_TIMEOUT_MS,600000);assert.equal(GATEWAY_CONNECT_TIMEOUT_MS,30000);assert.equal(GATEWAY_AGENT_OPTIONS.connect.timeout,30000);assert.equal(GATEWAY_AGENT_OPTIONS.headersTimeout,0);assert.equal(GATEWAY_AGENT_OPTIONS.bodyTimeout,0);assert.equal(GATEWAY_AGENT_OPTIONS.allowH2,false);
 assert.throws(()=>client.fetch(origin),/bounded/);assert.throws(()=>client.fetch('https://unrelated.invalid/',{signal:AbortSignal.timeout(1000)}),/origin mismatch/);
 const ok=await client.fetch(origin,{signal:AbortSignal.timeout(1000)});assert.equal(await ok.text(),'ok');assert.equal(version,'1.1');
 const redirect=await client.fetch(origin+'/redirect',{headers:{Authorization:'synthetic-only'},signal:AbortSignal.timeout(1000)});assert.equal(redirect.status,307);await redirect.body?.cancel();
 const before=calls;await assert.rejects(client.fetch(origin+'/reset',{method:'POST',body:'synthetic',signal:AbortSignal.timeout(1000)}));assert.equal(calls-before,1);
});
test('outer abort cancels a stalled body without resubmitting',async t=>{
 let calls=0;const server=http.createServer((req,res)=>{calls++;req.resume();res.writeHead(200,{'content-type':'text/plain'});res.write('start');});server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port,client=createGatewayTransport({origin});t.after(async()=>{await client.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const r=await client.fetch(origin,{method:'POST',body:'synthetic',signal:AbortSignal.timeout(80)});await assert.rejects(r.text());assert.equal(calls,1);
});
