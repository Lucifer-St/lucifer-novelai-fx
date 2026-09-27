import test from 'node:test';
import assert from 'node:assert/strict';
import {officialSuggestions} from '../src/lib/tag-client.mjs';

test('legacy official suggestion calls fail closed even when forced and never fetch',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',()=>{requests++;throw Error('unexpected fetch');});
 await assert.rejects(officialSuggestions('blue hair',new AbortController().signal,{force:true}),/仅提供本地词库/);
 assert.equal(requests,0);
});
