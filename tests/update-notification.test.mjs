import test from 'node:test';import assert from 'node:assert/strict';
import {createCachedReleaseCheck} from '../server/release-services.mjs';
import {RELEASE_NOTES,RELEASE_SEEN_KEY,needsReleaseNotes} from '../src/lib/release-notes.mjs';
import {assertReleaseMetadata} from '../scripts/assert-release.mjs';
test('a failed update read expires after a minute; recovery coalesces and success caches six hours',async()=>{
 let time=0,calls=0,reply={status:'network_error'};const check=createCachedReleaseCheck(async()=>{calls++;return reply},{now:()=>time});
 await Promise.all([check(true),check(true)]);assert.equal(calls,1);time=59000;await check(true);assert.equal(calls,1);
 time=61000;reply={status:'update_available',latestVersion:'9.0.0'};const result=await Promise.all([check(true),check(true)]);assert.equal(calls,2);assert.equal(result[0].latestVersion,'9.0.0');time+=5*3600000;await check(true);assert.equal(calls,2);time+=3600001;await check(true);assert.equal(calls,3);await check(false);assert.equal(calls,4);
});
test('each new release shows its announcement until acknowledged, independent of old acknowledgement',async()=>{
 const store=new Map([[RELEASE_SEEN_KEY,'1.8.1']]),storage={getItem:key=>store.get(key)};
 assert.equal(needsReleaseNotes(storage),true);store.set(RELEASE_SEEN_KEY,RELEASE_NOTES.version);assert.equal(needsReleaseNotes(storage),false);assert.equal(needsReleaseNotes({getItem(){throw Error('blocked')}}),true);await assertReleaseMetadata();
});
