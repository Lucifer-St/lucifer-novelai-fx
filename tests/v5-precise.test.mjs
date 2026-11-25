import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest,stateFromPayload} from '../src/lib/request.mjs';
import {DEFAULT_MODEL,CURATED_V5,MEDIUM_V5,modelSpec,validateModelPayload} from '../src/lib/model-policy.mjs';
import {v5PreciseReferenceCrop} from '../src/lib/image.mjs';
import {quoteAnlas,opusEligibility} from '../src/lib/anlas.mjs';

const precise=[
  {image:'abc',type:'character',sameOutfit:true,strength:3.5},
  {image:'def',type:'character&style',sameOutfit:false,strength:2},
  {image:'ghi',type:'costume',strength:5},
  {image:'skip',type:'style',enabled:false},
];
const setup=(model,effort)=>({...defaults(model),effort,seed:42,prompt:'A quiet garden',referenceMode:'precise',precise});

test('V5 Full, Medium and Curated send the official precise descriptions and restore their references',()=>{
  for(const [model,effort,wire] of [
    [DEFAULT_MODEL,'high',DEFAULT_MODEL],[DEFAULT_MODEL,'medium',MEDIUM_V5],[CURATED_V5,'high',CURATED_V5],
  ])for(const mode of ['generate','img2img']){
    assert.equal(modelSpec(model).webCapabilities.characterReferences,true);
    const request=buildRequest({...setup(model,effort),mode,source:'source'});
    const {model:actual,parameters:p}=request.novelai.body;
    assert.equal(actual,wire);
    assert.deepEqual(p.director_reference_images,['abc','def','ghi']);
    assert.deepEqual(p.director_reference_descriptions.map(d=>d.caption.base_caption),['character_mainoutfit','character&style_anyoutfit','costume']);
    assert.deepEqual(p.director_reference_strength_values,[3.5,2,5]);
    assert.deepEqual(p.director_reference_secondary_strength_values,[0,0,0]);
    const restored=stateFromPayload(request);
    assert.equal(restored.effort,effort);
    assert.equal(restored.precise[0].sameOutfit,true);
    assert.deepEqual(buildRequest(restored).novelai.body.parameters,p);
  }
});

test('V5 inpaint pauses ref drafts including the Curated fallback and blocks raw bypass',()=>{
  for(const model of [DEFAULT_MODEL,CURATED_V5]){
    const state=setup(model,'high');
    const on=buildRequest(state);
    const withMask=buildRequest({...state,mode:'infill',source:'source',mask:'mask',
      extraJSON:'{"director_reference_images":["expert"]}'});
    assert.equal(withMask.novelai.body.parameters.director_reference_images,undefined);
    assert.equal(state.precise.length,4);
    assert.throws(()=>validateModelPayload({...withMask,novelai:{...withMask.novelai,body:{
      ...withMask.novelai.body,
      parameters:{...withMask.novelai.body.parameters,director_reference_images:on.novelai.body.parameters.director_reference_images},
    }}}),/暂不支持精准参考/);
    assert.equal(buildRequest({...state,referenceMode:'off'}).novelai.body.parameters.director_reference_images,undefined);
  }
});

test('each active V5 reference is charged for each result and removes free-generation eligibility',()=>{
  const state={...setup(DEFAULT_MODEL,'medium'),n:2};
  const withRefs=buildRequest(state);
  const without=buildRequest({...state,referenceMode:'off'});
  const paidBase=quoteAnlas(without,[],{policy:'paid'}).paidPerImage;
  const quoted=quoteAnlas(withRefs,[],{policy:'opus'});
  assert.equal(quoted.amount,2*(paidBase+15));
  assert.equal(quoted.freeImages,0);
  assert.equal(opusEligibility(withRefs).qualifies,false);
});

test('V5 reference images use the closest official crop bucket',()=>{
  assert.deepEqual(v5PreciseReferenceCrop(1024,1024),{width:1024,height:1024,resizeWidth:1024,resizeHeight:1024,x:-0,y:-0});
  const tall=v5PreciseReferenceCrop(832,1216);
  assert.equal(tall.width,832);
  assert.equal(tall.height,1216);
  const landscape=v5PreciseReferenceCrop(2000,860);
  assert.ok(landscape.width>landscape.height);
  assert.equal(landscape.width%64,0);
  assert.equal(landscape.height%64,0);
});
