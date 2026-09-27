import test from 'node:test';import assert from 'node:assert/strict';
import {mergeHistory} from '../src/lib/history.mjs';
const entry=n=>({id:`${Date.UTC(2026,8,20)+n*1000}-test`,createdAt:new Date(Date.UTC(2026,8,20)+n*1000).toISOString(),n});
test('over 200 loaded entries cannot push the latest server results behind old records',()=>{
 const previous=Array.from({length:221},(_,i)=>entry(221-i)),incoming=Array.from({length:200},(_,i)=>entry(222-i));
 const result=mergeHistory(previous,incoming);assert.equal(result.length,222);assert.equal(result[0].n,222);assert.equal(result.at(-1).n,1);assert.equal(previous[0].n,221);
 assert.deepEqual(result.map(x=>x.n),Array.from({length:222},(_,i)=>222-i));
});
test('a stale history response preserves the result that arrived during its fetch and deduplicates IDs',()=>{
 const latest=entry(30),saved={...entry(20),saved:true};const result=mergeHistory([latest,entry(20),entry(10)],[saved,entry(10)]);
 assert.deepEqual(result.map(x=>x.n),[30,20,10]);assert.equal(result[1].saved,true);
});
test('late callbacks cannot reorder history by arrival; dates and legacy IDs sort across midnight',()=>{
 const newest=entry(90000),older=entry(2),legacy={id:entry(5).id};const result=mergeHistory([newest],[older,legacy]);
 assert.equal(result[0],newest);assert.ok(result.find(x=>x===legacy));assert.equal(mergeHistory([entry(4)],[entry(1)])[0].n,4);
});
