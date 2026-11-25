import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest,stateFromPayload,validateRequest,exportPreset} from '../src/lib/request.mjs';
import {MODEL_IDS,switchModel,validateModelPayload,CURATED_V5,MEDIUM_V5,MEDIUM_UC} from '../src/lib/model-policy.mjs';
import {quoteAnlas} from '../src/lib/anlas.mjs';
import {planOpusBatch} from '../src/lib/opus-batch.mjs';
import {applyMetadata,normalizeImageMetadata} from '../src/lib/metadata.mjs';
import {compilePrompt} from '../src/lib/prompt-text.mjs';
test('supported models retain exact generation and inpainting IDs through recipe roundtrip',()=>{
 for(const model of MODEL_IDS)for(const mode of ['generate','img2img','infill']){
  const state={...defaults(model),prompt:'landscape',seed:123,mode,source:'image',mask:'mask'};
  const payload=validateRequest(state,buildRequest(state));
  assert.equal(payload.model,model);
  assert.equal(payload.novelai.body.model,mode==='infill'&&model===CURATED_V5?'nai-diffusion-4-5-curated-inpainting':model+(mode==='infill'?'-inpainting':''));
  assert.equal(stateFromPayload(payload).model,model);assert.equal(exportPreset(state).state.model,model);
 }
});

test('Medium uses official wire IDs and fixed settings while retaining High editor drafts',()=>{
 const state={...defaults(),prompt:'garden',seed:42,effort:'medium',steps:27,sampler:'k_euler',
   negative:'custom exclusion',cfg_rescale:.3,scale:5,
   characters:[{prompt:'red coat',negative:'blue coat',x:.3,y:.5}],
   extraJSON:'{"steps":12,"cfg_rescale":0.5,"negative_prompt":"expert exclusion"}'};
 for (const mode of ['generate','img2img','infill']) {
  const payload=buildRequest({...state,mode,source:'source',mask:'mask'});
  const {model,parameters:p}=payload.novelai.body;
  assert.equal(payload.model,'nai-diffusion-5-full');
  assert.equal(model,mode==='infill'?MEDIUM_V5+'-inpainting':MEDIUM_V5);
  assert.equal(p.steps,14);
  assert.equal(p.sampler,'k_euler_ancestral');
  assert.equal(p.cfg_rescale,0);
  assert.equal(p.scale,5);
  assert.equal(p.negative_prompt,MEDIUM_UC);
  assert.equal(p.tag_hint_uc_preset,2);
  assert.equal(p.v4_negative_prompt.caption.char_captions[0].char_caption,'');
  assert.equal(p.v4_prompt.caption.char_captions[0].char_caption,'red coat');
  assert.equal(stateFromPayload(payload).effort,'medium');
  assert.throws(()=>validateModelPayload({...payload,novelai:{...payload.novelai,
    body:{...payload.novelai.body,parameters:{...p,steps:15}}}}),/固定 14 步/);
 }
 const high=buildRequest({...state,effort:'high',extraJSON:'{}'}).novelai.body.parameters;
 assert.equal(high.steps,27);assert.equal(high.sampler,'k_euler');
 assert.equal(high.cfg_rescale,.3);assert.equal(high.negative_prompt,'custom exclusion');
 const curated=switchModel(state,CURATED_V5);
 assert.equal(buildRequest(curated).novelai.body.model,CURATED_V5);
 assert.equal(switchModel(curated,state.model).effort,'medium');
});

test('Curated inpainting uses V4.5 parameters and Medium cost follows the official formula',()=>{
 const curated=buildRequest({...defaults(CURATED_V5),prompt:'flower',seed:10,mode:'infill',source:'image',mask:'mask',
   coords:true,characters:[{prompt:'person',negative:'bad pose',x:.37,y:.42}]});
 assert.equal(curated.novelai.body.parameters.params_version,4);
 assert.deepEqual(curated.novelai.body.parameters.v4_prompt.caption.char_captions[0].centers,[{x:.3,y:.5}]);
 assert.deepEqual(curated.novelai.body.parameters.v4_negative_prompt.caption.char_captions[0].centers,[{x:.3,y:.5}]);
 assert.equal(curated.novelai.body.parameters.tag_hint_uc_preset,undefined);
 const medium=buildRequest({...defaults(),effort:'medium',prompt:'flower',seed:10,n:2});
 assert.equal(quoteAnlas(medium,[],{policy:'paid'}).paidPerImage,15);
 assert.equal(quoteAnlas(medium,[],{policy:'opus'}).amount,15);
 assert.ok(planOpusBatch(medium).every(item=>item.novelai.body.model===MEDIUM_V5));
});

test('PNG settings import restores Medium without overriding locked High settings',()=>{
 const metadata=normalizeImageMetadata({Comment:JSON.stringify({model:MEDIUM_V5,prompt:'garden',steps:14,sampler:'k_euler_ancestral',seed:42})});
 const state={...defaults(),steps:27,sampler:'k_euler',negative:'keep'};
 const applied=applyMetadata(state,metadata,{settings:true,prompt:true,negative:false});
 assert.equal(applied.effort,'medium');
 assert.equal(applied.steps,27);
 assert.equal(applied.sampler,'k_euler');
 assert.equal(applied.negative,'keep');
 assert.equal(buildRequest(applied).novelai.body.model,MEDIUM_V5);
});
test('V4.5 reference wire fidelity and type are isolated from V5',()=>{
 const state={...defaults(MODEL_IDS[1]),prompt:'portrait',seed:123,referenceMode:'precise',precise:[{id:'ref',image:'data:image/png;base64,abc',type:'character&style',strength:.8,fidelity:.7}]};
 const p=buildRequest(state).novelai.body.parameters;
 assert.equal(p.director_reference_images[0],'abc');assert.equal(p.director_reference_descriptions[0].caption.base_caption,'character&style');assert.equal(p.director_reference_descriptions[0].legacy_uc,false);assert.ok(Math.abs(p.director_reference_secondary_strength_values[0]-.3)<1e-10);
 const v5=switchModel(state,MODEL_IDS[0]);assert.equal(v5.referenceMode,'off');assert.equal(buildRequest(v5).novelai.body.parameters.director_reference_images,undefined);
 assert.deepEqual(switchModel(v5,MODEL_IDS[1]).precise,state.precise);
 assert.throws(()=>validateModelPayload({model:MODEL_IDS[0],novelai:{parameters:{director_reference_images:['abc']}}}),/数量不一致/);
 assert.throws(()=>validateModelPayload({model:MODEL_IDS[0],novelai:{parameters:{reference_image_multiple:[]}}}),/V4.5/);
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
