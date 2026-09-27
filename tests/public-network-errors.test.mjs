import test from 'node:test';
import assert from 'node:assert/strict';
import {publicNetworkMessage} from '../server/public-network-errors.mjs';
import {createDanbooru} from '../server/danbooru.mjs';
import {atlasResource} from '../server/atlas.mjs';

test('public service errors identify the failing service and preserve no-retry isolation',async()=>{
 for(const [code,expected] of [['ENOTFOUND','域名解析'],['UND_ERR_CONNECT_TIMEOUT','建立连接超时'],['ECONNRESET','连接中断'],['CERT_HAS_EXPIRED','安全连接验证']]){
  const error=Object.assign(Error('https://secret.example/token?key=private'),{cause:{code}});
  assert.match(publicNetworkMessage(error,'公开服务'),new RegExp(expected));
  assert.doesNotMatch(publicNetworkMessage(error,'公开服务'),/secret|private|token/);
  for(const service of ['danbooru','atlas']){
   let calls=0;const fetchImpl=async()=>{calls++;throw error;};
   const result=service==='danbooru'?createDanbooru({fetchImpl}).posts(new URLSearchParams()):atlasResource('https://assets.quicktagcloud.com/data/test.json',{fetchImpl});
   await assert.rejects(result,e=>e.message.includes(expected)&&e.message.includes(service==='danbooru'?'Danbooru':'法典图鉴'));assert.equal(calls,1);
  }
 }
 assert.match(publicNetworkMessage(new DOMException('timeout','TimeoutError'),'图鉴'),/读取超时/);
});
