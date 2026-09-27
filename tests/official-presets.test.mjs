import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,buildRequest,stateFromPayload,exportPreset} from '../src/lib/request.mjs';
import {switchModel,MODEL_IDS} from '../src/lib/model-policy.mjs';
import {applyMetadata,normalizeImageMetadata} from '../src/lib/metadata.mjs';
import {variantState,comparisonDefaults} from '../src/lib/comparison.mjs';
import {negativePresets,applyNegativePreset,splitNegativePreset,qualitySuffix} from '../src/lib/official-presets.mjs';

test('official UC selection preserves custom text, changes only complete prefixes and is idempotent',()=>{
 for(const model of MODEL_IDS){
  const presets=negativePresets(model);
  for(const key of Object.keys(presets)){
   const selected=applyNegativePreset('my custom exclusion',model,key);
   assert.equal(selected,presets[key]+', my custom exclusion');
   assert.equal(applyNegativePreset(selected,model,key),selected);
   assert.equal(applyNegativePreset(selected,model,'none'),'my custom exclusion');
   assert.equal(applyNegativePreset(selected,model,'light'),presets.light+', my custom exclusion');
   assert.equal(splitNegativePreset(selected,model).preset,key);
  }
  const changed='hand-edited '+presets.heavy;
  assert.equal(applyNegativePreset(changed,model,'none'),changed);
 }
 assert.equal(negativePresets(MODEL_IDS[2]).furry,undefined);
});

test('V5 Light uses official text and hint 3, history and preset roundtrips never duplicate tags',()=>{
 const original={...defaults(),prompt:'garden',qualityPreset:'light',negative:applyNegativePreset('my exclusion',MODEL_IDS[0],'human')};
 const payload=buildRequest(original),p=payload.novelai.body.parameters;
 assert.equal(payload.novelai.body.input,'garden, very aesthetic, amazing quality, no text');
 assert.equal(p.tag_hint_qt,3);assert.equal(p.tag_hint_uc_preset,4);
 const restored=stateFromPayload(payload);
 assert.equal(restored.prompt,'garden');assert.equal(restored.qualityPreset,'light');assert.equal(restored.negative,original.negative);
 assert.deepEqual(buildRequest(restored),payload);
 assert.deepEqual(buildRequest(exportPreset(original).state),payload);
 assert.equal(buildRequest({...original,prompt:payload.novelai.body.input}).novelai.body.input,payload.novelai.body.input);
 assert.equal(buildRequest({...restored,qualityPreset:'standard'}).novelai.body.parameters.tag_hint_qt,1);
 assert.equal(buildRequest({...restored,negative:'my exclusion'}).novelai.body.parameters.tag_hint_uc_preset,0);
 assert.equal(buildRequest({...restored,quality:false}).novelai.body.parameters.tag_hint_qt,0);
});

test('Light with V5 Text is preserved by history and selective PNG metadata import',()=>{
 const state={...defaults(),prompt:'sign',imageText:'HELLO',qualityPreset:'light'},payload=buildRequest(state);
 assert.equal(payload.novelai.body.input,'sign, very aesthetic, amazing quality\nText: HELLO');
 assert.deepEqual(buildRequest(stateFromPayload(payload)),payload);
 const metadata=normalizeImageMetadata({Source:'NovelAI Diffusion V5 Full',Comment:JSON.stringify({...payload.novelai.body.parameters,prompt:payload.novelai.body.input})});
 const next=applyMetadata({...defaults(),negative:'keep',seed:123},metadata,{prompt:true,negative:false,characters:false,settings:false,seed:false});
 assert.equal(next.qualityPreset,'light');assert.equal(next.negative,'keep');assert.equal(next.seed,123);
 assert.equal(buildRequest(next).novelai.body.input,payload.novelai.body.input);
 assert.equal(buildRequest({...next,qualityPreset:'standard'}).novelai.body.parameters.tag_hint_qt,1);
});

test('model changes use that model UC text while restoring V5 quality choice and custom suffix',()=>{
 const v5={...defaults(),prompt:'garden',qualityPreset:'light',negative:applyNegativePreset('custom tail',MODEL_IDS[0],'light')};
 const curated=switchModel(v5,MODEL_IDS[2]);
 assert.equal(curated.qualityPreset,'standard');assert.equal(curated.negative,negativePresets(MODEL_IDS[2]).light+', custom tail');
 assert.equal(buildRequest(curated).novelai.body.input,'garden'+qualitySuffix(MODEL_IDS[2]));
 const back=switchModel(curated,MODEL_IDS[0]);assert.equal(back.qualityPreset,'light');assert.equal(back.negative,v5.negative);
 const config=comparisonDefaults({overrides:{B:{qualityPreset:'light'}}});
 assert.equal(buildRequest(variantState(defaults(),config,'B')).novelai.body.parameters.tag_hint_qt,3);
});
