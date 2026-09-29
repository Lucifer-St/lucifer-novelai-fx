import test from 'node:test';import assert from 'node:assert/strict';import {defaults} from '../src/lib/request.mjs';import {dimensionCostHint} from '../src/lib/dimension-cost.mjs';
test('dimension cost warns by total pixels, not by either side alone',()=>{
 for(const model of ['nai-diffusion-5-full','nai-diffusion-4-5-full','nai-diffusion-4-5-curated']){
  const s={...defaults(model),width:1024,height:1024,steps:28};assert.equal(dimensionCostHint(s).level,'info');assert.equal(dimensionCostHint({...s,width:1088}).level,'warning');assert.match(dimensionCostHint({...s,width:1088}).title,/超出/);assert.equal(dimensionCostHint({...s,width:2048,height:512}).level,'info');assert.equal(dimensionCostHint({...s,width:1216,height:832}).level,'info');
 }
});
test('cost hint respects paid policy, steps, actual expert dimensions and invalid JSON',()=>{
 const s={...defaults(),width:1024,height:1024,steps:28};assert.match(dimensionCostHint(s,{policy:'paid'}).title,/付费/);assert.match(dimensionCostHint({...s,steps:29}).detail,/步数超过 28/);assert.match(dimensionCostHint({...s,overrides:{width:1536}}).detail,/1536 × 1024/);assert.match(dimensionCostHint({...s,extraJSON:'{"width":1536}'}).title,/超出/);assert.equal(dimensionCostHint({...s,extraJSON:'{bad'}).level,'unknown');
});
