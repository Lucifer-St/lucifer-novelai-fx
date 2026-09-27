import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest,stateFromPayload,validateRequest,exportPreset} from '../src/lib/request.mjs';
import {MODEL_IDS,switchModel,validateModelPayload} from '../src/lib/model-policy.mjs';
import {compilePrompt} from '../src/lib/prompt-text.mjs';
test('three models retain exact generation and inpainting IDs through recipe roundtrip',()=>{
 for(const model of MODEL_IDS)for(const mode of ['generate','img2img','infill']){
  const state={...defaults(model),prompt:'landscape',seed:123,mode,source:'image',mask:'mask'};
  const payload=validateRequest(state,buildRequest(state));
  assert.equal(payload.model,model);assert.equal(payload.novelai.body.model,model+(mode==='infill'?'-inpainting':''));
  assert.equal(stateFromPayload(payload).model,model);assert.equal(exportPreset(state).state.model,model);
 }
});
test('V4.5 reference wire fidelity and type are isolated from V5',()=>{
 const state={...defaults(MODEL_IDS[1]),prompt:'portrait',seed:123,referenceMode:'precise',precise:[{id:'ref',image:'data:image/png;base64,abc',type:'character&style',strength:.8,fidelity:.7}]};
 const p=buildRequest(state).novelai.body.parameters;
 assert.equal(p.director_reference_images[0],'abc');assert.equal(p.director_reference_descriptions[0].caption.base_caption,'character&style');assert.equal(p.director_reference_descriptions[0].legacy_uc,false);assert.ok(Math.abs(p.director_reference_secondary_strength_values[0]-.3)<1e-10);
 const v5=switchModel(state,MODEL_IDS[0]);assert.equal(v5.referenceMode,'off');assert.equal(buildRequest(v5).novelai.body.parameters.director_reference_images,undefined);
 assert.deepEqual(switchModel(v5,MODEL_IDS[1]).precise,state.precise);
 for(const payload of [{model:MODEL_IDS[0],novelai:{parameters:{director_reference_images:['abc']}}},{model:MODEL_IDS[0],novelai:{endpoint:'/ai/generate-image',body:{model:MODEL_IDS[0],action:'generate',parameters:{reference_image_multiple:[]}}}}])assert.throws(()=>validateModelPayload(payload),/V4.5/);
});
test('Vibe requires explicit valid cached encoding and cannot coexist with Precise',()=>{
 const state={...defaults(MODEL_IDS[2]),prompt:'landscape',seed:2,referenceMode:'vibe',vibes:[{image:'x',information:.6,strength:.4}]};
 assert.throws(()=>buildRequest(state),/编码/);
 state.vibes[0]={...state.vibes[0],encoding:'encoded',encodedModel:state.model,encodedInformation:.6};
 const payload=buildRequest(state);assert.deepEqual(payload.novelai.body.parameters.reference_image_multiple,['encoded']);
 state.vibes[0].information=.5;assert.throws(()=>buildRequest(state),/编码/);
 payload.novelai.body.parameters.director_reference_images=['precise'];assert.throws(()=>validateModelPayload(payload),/同时/);
});
test('switching to V4.5 never silently truncates excess character drafts',()=>{
 const state={...defaults(),prompt:'group',seed:4,characters:Array.from({length:7},(_,i)=>({id:String(i),prompt:'person',negative:'',x:.5,y:.5}))};
 const next=switchModel(state,MODEL_IDS[1]);assert.equal(next.characters.length,7);assert.throws(()=>buildRequest(next),/6/);assert.equal(state.characters.length,7);
});
test('V5 Text remains last and removes only the automatic no-text suffix',()=>{
 assert.equal(compilePrompt('sign',{qualitySuffix:', masterpiece, no text',imageText:'你好'}),'sign, masterpiece\nText: 你好');
 const manual='sign\nText: HELLO';assert.equal(compilePrompt(manual,{autoText:true,imageText:'ignored',qualitySuffix:', masterpiece, no text'}),'sign, masterpiece\nText: HELLO');
 assert.equal(compilePrompt('a sign saying “hello”',{autoText:true}),'a sign saying “hello”\nText: hello');
 const state={...defaults(MODEL_IDS[1]),prompt:'scene',imageText:'hidden',autoText:true};assert.ok(!buildRequest(state).novelai.body.input.includes('Text:'));
 const first=buildRequest({...defaults(),prompt:'sign',imageText:'HELLO',seed:123});assert.equal(buildRequest(stateFromPayload(first)).novelai.body.input,first.novelai.body.input);
});
test('disabled references cannot be activated by hidden expert JSON',()=>{
 const state={...defaults(MODEL_IDS[1]),prompt:'portrait',extraJSON:JSON.stringify({director_reference_images:['image'],director_reference_descriptions:[{caption:{base_caption:'character',char_captions:[]}}],director_reference_information_extracted:[1],director_reference_strength_values:[1],director_reference_secondary_strength_values:[0]})};
 assert.throws(()=>buildRequest(state),/参考图已关闭/);
});
test('V4.5 grid is validated without changing imported positions',()=>{
 const state={...defaults(MODEL_IDS[1]),prompt:'person',coords:true,characters:[{prompt:'person',negative:'',x:.37,y:.42}]};assert.throws(()=>buildRequest(state),/5×5/);assert.equal(state.characters[0].x,.37);
 state.characters[0].x=.3;state.characters[0].y=.5;assert.doesNotThrow(()=>buildRequest(state));
});
