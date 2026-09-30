import test from 'node:test';import assert from 'node:assert/strict';
import {defaults,buildRequest} from '../src/lib/request.mjs';import {comparisonDefaults,planComparison} from '../src/lib/comparison.mjs';
import {quoteAnlas,priceKey} from '../src/lib/anlas.mjs';import {quoteComparisonTotal,generationCostDisplay} from '../src/lib/generation-cost.mjs';
test('button values distinguish actual zero, positive costs, unknown and an active task',()=>{
 assert.equal(generationCostDisplay(0).text,'0');assert.match(generationCostDisplay(0).description,/Opus/);assert.equal(generationCostDisplay(45).text,'45');
 for(const value of [null,undefined,NaN,Infinity,-1])assert.equal(generationCostDisplay(value).text,'—');
 assert.equal(generationCostDisplay(45,{busy:true}).text,'…');assert.match(generationCostDisplay(90,{comparison:true}).description,/整个对照组/);
 const s={...defaults(),prompt:'a garden',width:1024,height:1024,steps:28};assert.equal(generationCostDisplay(quoteAnlas(buildRequest(s)).amount).text,'0');assert.equal(generationCostDisplay(quoteAnlas(buildRequest({...s,width:1536})).amount).text,'45');assert.equal(quoteAnlas(buildRequest({...s,n:3})).amount,60);
});
test('comparison quote equals the full executed plan, including forced single samples and expert overrides',()=>{
 for(const model of ['nai-diffusion-5-full','nai-diffusion-4-5-full','nai-diffusion-4-5-curated'])for(const policy of ['opus','paid']){
  const s={...defaults(model),prompt:'garden',seed:42,n:4,overrides:{n_samples:3},extraJSON:'{"n_samples":2,"seed":123}'},config={...comparisonDefaults(),enabled:true,mode:'ABC',rounds:2,overrides:{B:{steps:29},C:{}}};
  const before=JSON.stringify(s),jobs=planComparison(s,config,{seedFactory:()=>0}).jobs;
  const quotes=jobs.map(job=>quoteAnlas(job.payload,[],{policy})),expected=quotes.every(q=>q.known)?quotes.reduce((sum,q)=>sum+q.amount,0):null;
  assert.equal(quoteComparisonTotal(s,config,[],policy),expected);assert.equal(JSON.stringify(s),before);
 }
});
test('V4.5 comparison uses single-image free eligibility and keeps unverified paid costs unknown',()=>{
 const s={...defaults('nai-diffusion-4-5-full'),prompt:'garden',n:3},config={...comparisonDefaults(),enabled:true,mode:'AB',rounds:3};assert.equal(quoteComparisonTotal(s,config),0);assert.equal(quoteComparisonTotal(s,config,[],'paid'),null);
 const single=buildRequest({...s,n:1}),calibrations=[{key:priceKey(single),amount:12}];assert.equal(quoteComparisonTotal(s,config,calibrations,'paid'),72);
 assert.equal(quoteComparisonTotal(s,{...config,rounds:0}),null);assert.equal(quoteComparisonTotal({...s,extraJSON:'{bad'},config),null);
});
