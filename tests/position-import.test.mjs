import test from 'node:test';
import assert from 'node:assert/strict';
import {importOptions,availableImportOptions,DEFAULT_IMPORT_OPTIONS} from '../src/lib/import-options.mjs';
import {pointerPosition,fitPositionCanvas,positionValue} from '../src/lib/character-position.mjs';
import {buildRequest,defaults,stateFromPayload} from '../src/lib/request.mjs';
test('import preferences retain explicit false and append, while missing metadata only masks this import',()=>{
 assert.deepEqual(importOptions(null),DEFAULT_IMPORT_OPTIONS);
 const options=importOptions({version:1,options:{prompt:false,negative:true,characters:true,seed:true,append:true,settings:'true'}});
 assert.equal(options.settings,false);const masked=availableImportOptions(options,{prompt:true,negative:false});assert.equal(masked.negative,false);assert.equal(options.negative,true);assert.equal(masked.append,true);assert.equal(options.seed,true);
});
test('drag coordinates respect the fitted aspect ratio, preserve grab offset and clamp edges',()=>{
 assert.deepEqual(fitPositionCanvas(1600,900,800,600),{width:800,height:450});
 assert.deepEqual(fitPositionCanvas(800,1600,800,600),{width:300,height:600});
 const rect={left:100,top:50,width:400,height:600};assert.deepEqual(pointerPosition(rect,210,475,10,5),{x:.25,y:.7});assert.deepEqual(pointerPosition(rect,-20,900),{x:0,y:1});assert.equal(positionValue(.333333),.333);
});
test('moving an imported role updates paired captions while preserving other roles and additional centers',()=>{
 const state={...defaults(),prompt:'garden',coords:true,characters:[{id:'a',prompt:'silver hair',negative:'hat',x:.4,y:.6,enabled:true},{id:'b',prompt:'black hair',negative:'coat',x:.8,y:.2,enabled:true}]};const incoming=buildRequest(state);incoming.novelai.body.parameters.v4_prompt.caption.char_captions[0].centers.push({x:.7,y:.3});
 const restored=stateFromPayload(incoming);restored.characters[0]={...restored.characters[0],x:.325,y:.675};const p=buildRequest(restored).novelai.body.parameters;
 assert.deepEqual(p.v4_prompt.caption.char_captions[0].centers,[{x:.325,y:.675},{x:.7,y:.3}]);assert.deepEqual(p.v4_negative_prompt.caption.char_captions[0].centers[0],{x:.325,y:.675});assert.deepEqual(p.v4_prompt.caption.char_captions[1].centers[0],{x:.8,y:.2});
});
