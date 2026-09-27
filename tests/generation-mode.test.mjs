import test from 'node:test';import assert from'node:assert/strict';
import{defaults,buildRequest,exportPreset}from'../src/lib/request.mjs';import{variantState,comparisonDefaults}from'../src/lib/comparison.mjs';import{changeGenerationMode,cleanComparisonMode,restoreGenerationMode}from'../src/lib/generation-mode.mjs';
const image='data:image/png;base64,fixture';
test('exiting image workflows removes hidden conditioning while retaining prompts, parameters and local input',()=>{
 const input={...defaults(),mode:'infill',prompt:'garden',negative:'blur',source:image,mask:image,steps:24,cfg_rescale:.6,overrides:{image:'legacy',mask:'legacy',img2img:{strength:.9},strength:.9,noise:.2,scale:6},extraJSON:JSON.stringify({image:'other',mask:'other',img2img:{strength:.5},noise:.8,future_field:7})};
 const next=changeGenerationMode(input,'generate'),payload=buildRequest(next),params=payload.novelai.body.parameters;
 assert.equal(next.source,image);assert.equal(next.mask,image);assert.equal(next.prompt,'garden');assert.equal(next.negative,'blur');assert.equal(next.steps,24);assert.equal(next.cfg_rescale,.6);assert.equal(payload.novelai.body.action,'generate');
 for(const key of['image','mask','img2img','strength','noise'])assert.equal(Object.hasOwn(params,key),false,key);assert.equal(params.future_field,7);assert.equal(params.scale,6);assert.equal(input.overrides.image,'legacy');
});
test('empty autosaved image mode restores to txt2img without overwriting other settings',()=>{
 for(const mode of['img2img','infill']){const original={...defaults(),mode,source:image,mask:image,prompt:'keep',seed:42,cfg_rescale:.6},saved=exportPreset(original).state,restored=restoreGenerationMode(saved);assert.equal(saved.source,'');assert.equal(restored.mode,'generate');assert.equal(restored.prompt,'keep');assert.equal(restored.seed,42);assert.equal(restored.cfg_rescale,.6);assert.equal(restoreGenerationMode(original).mode,mode);}
});
test('exiting clears image overrides in every comparison variant and preserves their text differences',()=>{
 const base=changeGenerationMode({...defaults(),prompt:'base',mode:'img2img',source:image,overrides:{image:'old'}},'generate');const cfg=cleanComparisonMode(comparisonDefaults({overrides:{B:{prompt:'variant B',overrides:{image:'b',scale:6}},C:{extraJSON:'{"mask":"c","image":"c","cfg_rescale":0.7}'}}}),'generate');
 for(const label of['A','B','C']){const payload=buildRequest(variantState(base,cfg,label));assert.equal(payload.novelai.body.action,'generate');assert.equal(payload.novelai.body.parameters.image,undefined);assert.equal(payload.novelai.body.parameters.mask,undefined);}assert.equal(variantState(base,cfg,'B').prompt,'variant B');assert.equal(buildRequest(variantState(base,cfg,'C')).novelai.body.parameters.cfg_rescale,.7);
});
test('img2img drops inpaint overrides and malformed manual JSON remains inspectable',()=>{
 const next=changeGenerationMode({...defaults(),mode:'infill',overrides:{image:'keep',mask:'remove',img2img:{strength:.4}},extraJSON:'{"mask":"remove","scale":5}'},'img2img');assert.deepEqual(next.overrides,{image:'keep'});assert.deepEqual(JSON.parse(next.extraJSON),{scale:5});const bad=changeGenerationMode({...defaults(),extraJSON:'broken'},'generate');assert.equal(bad.extraJSON,'broken');assert.throws(()=>buildRequest(bad));
});

