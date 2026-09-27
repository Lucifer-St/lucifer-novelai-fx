import test from 'node:test';import assert from 'node:assert/strict';
import {resolveLoadingSkin,normalizeAppearance,LOADING_SKINS,LOADING_ILLUSTRATED_COUNT,readAppearance} from '../src/lib/loading-skins.mjs';
test('random loading selection only uses illustrated choices and never repeats the previous card',()=>{
 const ids=LOADING_SKINS.filter(x=>x.image).map(x=>x.id);
 for(const previous of ['',...ids])for(const value of [0,.1,.3,.5,.7,.999999,1,NaN]){
  const next=resolveLoadingSkin('random',previous,()=>value);assert.ok(ids.includes(next));assert.notEqual(next,previous);
 }
 assert.equal(resolveLoadingSkin('classic','',()=>{throw Error('fixed choice must not draw')}),'classic');
 assert.equal(resolveLoadingSkin('lily-violin','',()=>{throw Error('fixed choice must not draw')}),'lily-violin');
});

test('new scene cards round-trip and all nine illustrations are reachable in the random pool',()=>{
 const ids=LOADING_SKINS.filter(s=>s.image).map(s=>s.id);
 assert.equal(LOADING_ILLUSTRATED_COUNT,9);
 assert.deepEqual(ids.map((_,i)=>resolveLoadingSkin('random','',()=>(i+.5)/ids.length)),ids);
 for(const loadingSkin of ['symphonic-rehearsal','elixir-maintenance','lemmtear-reading']){
  assert.equal(normalizeAppearance({loadingSkin,workbenchSkin:'symphonic',motion:'off'}).loadingSkin,loadingSkin);
  assert.ok(LOADING_SKINS.find(s=>s.id===loadingSkin).width>1000);
 }
});
test('random preference round-trips without losing existing motion or resetting other browser data',()=>{
 const saved={version:1,loadingSkin:'random',motion:'off'};
 assert.deepEqual(readAppearance({getItem:()=>JSON.stringify(saved)}),{...saved,workbenchSkin:'classic',characterDecorations:true});
 assert.deepEqual(normalizeAppearance({loadingSkin:'removed-skin',motion:'off'}),{version:1,workbenchSkin:'classic',loadingSkin:'claire-noire',motion:'off',characterDecorations:true});
});

test('workbench themes migrate old preferences independently of loading and motion',()=>{
 const selected={version:1,workbenchSkin:'book-contract',loadingSkin:'random',motion:'off',characterDecorations:true};
 assert.deepEqual(readAppearance({getItem:()=>JSON.stringify(selected)}),selected);
 assert.deepEqual(normalizeAppearance({...selected,workbenchSkin:'retired'}),{...selected,workbenchSkin:'classic'});
 assert.equal(readAppearance({getItem:()=>'{bad json'}).workbenchSkin,'classic');
 for(const workbenchSkin of ['symphonic','elixir','lemmtear'])assert.deepEqual(normalizeAppearance({...selected,workbenchSkin}),{...selected,workbenchSkin});
});

test('character-decoration preferences migrate independently and retain explicit false',()=>{
 const old={version:1,workbenchSkin:'symphonic',loadingSkin:'lemmtear-reading',motion:'off'};
 assert.deepEqual(normalizeAppearance(old),{...old,characterDecorations:true});
 const disabled={...old,characterDecorations:false};
 assert.deepEqual(readAppearance({getItem:()=>JSON.stringify(disabled)}),disabled);
 assert.deepEqual(normalizeAppearance({...disabled,workbenchSkin:'classic'}),{...disabled,workbenchSkin:'classic'});
});
