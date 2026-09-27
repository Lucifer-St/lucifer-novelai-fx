import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_UI_SKINS,DEFAULT_APPEARANCE,WORKBENCH_SKINS,normalizeAppearance,readAppearance} from '../src/lib/loading-skins.mjs';

test('Teresa is a stable independent workbench skin without changing existing appearance defaults',()=>{
 const teresa=WORKBENCH_SKINS.find(s=>s.id==='teresa');
 assert.deepEqual(teresa,{id:'teresa',name:'Teresa · 特蕾莎',subtitle:'暖纸私笺 · 皇冠蜡封'});
 assert.ok(CHARACTER_UI_SKINS.includes('teresa'));
 assert.equal(DEFAULT_APPEARANCE.workbenchSkin,'classic');
 assert.equal(normalizeAppearance({workbenchSkin:'teresa',loadingSkin:'classic',motion:'off',characterDecorations:false}).workbenchSkin,'teresa');
});

test('Teresa and every prior saved workbench choice round-trip without migration loss',()=>{
 for(const skin of WORKBENCH_SKINS){
  const saved={version:1,workbenchSkin:skin.id,loadingSkin:'teresa',motion:'off',characterDecorations:skin.id!=='teresa'};
  assert.deepEqual(readAppearance({getItem:()=>JSON.stringify(saved)}),saved);
 }
 assert.equal(normalizeAppearance({workbenchSkin:'unknown-retired-skin'}).workbenchSkin,'classic');
});
