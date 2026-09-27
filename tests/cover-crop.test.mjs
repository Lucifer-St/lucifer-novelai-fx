import test from 'node:test';
import assert from 'node:assert/strict';
import {cropSquare,panCrop,COVER_SIZE} from '../src/lib/cover-crop.mjs';
import {rankQuickCards} from '../src/lib/card-usage.mjs';
test('square cover starts centered, keeps its aspect and clamps pan/zoom to source bounds',()=>{
 assert.equal(COVER_SIZE,512);assert.deepEqual(cropSquare(1200,600),{x:300,y:0,side:600,centerX:.5,centerY:.5,zoom:1});
 const c=cropSquare(1200,600,2);assert.equal(c.side,300);assert.equal(c.x,450);
 assert.equal(panCrop(1200,600,c,2000,2000,320).x,0);assert.equal(panCrop(1200,600,c,-2000,-2000,320).y,300);
 for(const [w,h] of [[200,1000],[1200,600],[513,513]])for(const z of [-1,1,1.25,2,4,100]){const r=cropSquare(w,h,z,.98,-5);assert.ok(r.x>=0&&r.y>=0&&r.x+r.side<=w&&r.y+r.side<=h);assert.ok(r.zoom>=1&&r.zoom<=4);}
 assert.throws(()=>cropSquare(0,20),/尺寸/);
});
test('quick cards rank by actual use with recent saves as deterministic fallback',()=>{
 const cards=[{id:'a',updatedAt:'2026-09-20'},{id:'b',updatedAt:'2026-09-21'},{id:'c',updatedAt:'2026-09-19'}];
 assert.deepEqual(rankQuickCards(cards).map(c=>c.id),['b','a','c']);assert.deepEqual(rankQuickCards(cards,{a:{count:2,at:1},c:{count:3,at:2}}).map(c=>c.id),['c','a','b']);assert.equal(cards[0].id,'a');
});
