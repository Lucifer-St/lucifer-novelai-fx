import test from 'node:test';import assert from 'node:assert/strict';
import {createThumbnailQueue} from '../src/lib/thumbnail-queue.mjs';
test('thumbnail queue bounds reads and skips cancelled old-page work',async()=>{
 const queue=createThumbnailQueue(2),gate=Promise.withResolvers(),controllers=Array.from({length:5},()=>new AbortController());let active=0,max=0;const started=[];
 const jobs=controllers.map((controller,i)=>queue.run(async()=>{started.push(i);active++;max=Math.max(max,active);await gate.promise;active--;return i;},controller.signal));
 const settled=Promise.allSettled(jobs);await Promise.resolve();assert.deepEqual(started,[0,1]);controllers[2].abort();controllers[3].abort();gate.resolve();const results=await settled;assert.equal(max,2);assert.deepEqual(started,[0,1,4]);assert.equal(results[2].status,'rejected');assert.equal(results[4].value,4);
});
test('active thumbnail abort frees a slot for the next page without retrying',async()=>{
 const queue=createThumbnailQueue(1),controller=new AbortController(),ready=Promise.withResolvers();let calls=0;
 const old=queue.run(()=>{calls++;ready.resolve();return new Promise((resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true}));},controller.signal);const result=old.catch(e=>e.name);await ready.promise;
 const next=queue.run(()=>{calls++;return 'new-page';},new AbortController().signal);controller.abort();assert.equal(await result,'AbortError');assert.equal(await next,'new-page');assert.equal(calls,2);
});
