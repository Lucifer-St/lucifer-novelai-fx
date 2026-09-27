import test from 'node:test';
import assert from 'node:assert/strict';
import {readPromptTarget,writePromptTarget,characterField} from '../src/lib/prompt-targets.mjs';
import {defaults,buildRequest,exportPreset} from '../src/lib/request.mjs';
test('role cards follow stable IDs, survive presets, and never leak into upstream character captions',()=>{
 const state={...defaults(),prompt:'landscape',characters:[{id:'one',prompt:'white hair',negative:'blur',x:.2,y:.5,enabled:true},{id:'two',prompt:'blue hair',negative:'hat',x:.8,y:.5,enabled:true}]};
 const cards=[{instanceId:'x',title:'snow',start:0,end:4,text:'snow'}];
 const updated=writePromptTarget(state,characterField('two','prompt'),'snow',cards);
 const reordered={...updated,characters:[updated.characters[1]]};
 assert.equal(readPromptTarget(reordered,characterField('two','prompt')).text,'snow');
 assert.deepEqual(readPromptTarget(exportPreset(updated).state,characterField('two','prompt')).cards,cards);
 assert.equal(updated.characters[0].prompt,'white hair');assert.equal(updated.characters[1].negative,'hat');
 assert.equal(JSON.stringify(buildRequest(updated)).includes('instanceId'),false);
 assert.equal(writePromptTarget(reordered,characterField('gone','prompt'),'oops',[]),reordered);
});
test('Transparent BG adds its actual prompt tag once, honors explicit false, and leaves user text intact',()=>{
 const state={...defaults(),prompt:'a flower',quality:false,overrides:{tag_hint_transparent_background:true}};
 const body=buildRequest(state).novelai.body;
 assert.equal(body.input,'a flower, transparent background');assert.equal(body.parameters.v4_prompt.caption.base_caption,body.input);assert.equal(state.prompt,'a flower');
 assert.equal(buildRequest({...state,prompt:'flower, 2.1::transparent background::'}).novelai.body.input,'flower, 2.1::transparent background::');
 assert.equal(buildRequest({...state,extraJSON:'{"tag_hint_transparent_background":false}'}).novelai.body.input,'a flower');
});
