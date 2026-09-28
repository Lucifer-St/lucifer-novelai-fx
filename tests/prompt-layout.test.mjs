import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePromptLayout,readPromptLayout,toggleCharacterFold,toggleFieldFold,writePromptLayout,PROMPT_LAYOUT_KEY} from '../src/lib/prompt-layout.mjs';
import {defaults,buildRequest,exportPreset} from '../src/lib/request.mjs';
test('layout preferences are versioned, bounded, and keyed by stable character IDs',()=>{
 assert.equal(readPromptLayout(null).mode,'classic');assert.equal(readPromptLayout({getItem:()=>'{'}).mode,'classic');assert.equal(normalizePromptLayout({version:2,mode:'merged'}).mode,'classic');
 const first={version:1,mode:'merged',mainCollapsed:true,characters:{alice:true,bob:false}},next=toggleCharacterFold(first,'bob');assert.equal(next.characters.alice,true);assert.equal(next.characters.bob,true);assert.equal(first.characters.bob,false);
 let saved;writePromptLayout({setItem:(key,value)=>{assert.equal(key,PROMPT_LAYOUT_KEY);saved=value;}},next);assert.deepEqual(readPromptLayout({getItem:()=>saved}),next);
 const invalid=normalizePromptLayout({version:1,mode:'two-column',characters:{a:'false',b:false},prompt:'must not store',enabled:false});assert.equal(invalid.mode,'classic');assert.deepEqual(invalid.characters,{b:false});assert.equal('prompt' in invalid,false);
});
test('folding is presentation only and never changes enabled role payloads or exported recipes',()=>{
 const state={...defaults(),prompt:'garden',seed:42,characters:[{id:'alice',enabled:true,prompt:'Alice',negative:'hat',x:.5,y:.5},{id:'bob',enabled:true,prompt:'Bob',negative:'coat',x:.5,y:.5}]};
 const payload=buildRequest(state),recipe=exportPreset(state),layout=toggleCharacterFold({version:1,mode:'merged'},'alice');
 assert.equal(layout.characters.alice,true);assert.deepEqual(buildRequest(state),payload);assert.deepEqual(exportPreset(state),recipe);assert.equal(payload.novelai.body.parameters.v4_prompt.caption.char_captions.length,2);assert.equal('layout' in recipe.state,false);
});

test('negative field folds survive storage and remain independent by stable role ID',()=>{const a=toggleFieldFold({version:1,mode:'merged'},'negative'),b=toggleFieldFold(a,'character:alice:negative');assert.equal(b.fields.negative,true);assert.equal(b.fields['character:alice:negative'],true);assert.equal(b.fields['character:bob:negative'],undefined);assert.equal(toggleFieldFold(b,'negative').fields.negative,false);let raw;writePromptLayout({setItem:(_,v)=>raw=v},b);assert.deepEqual(readPromptLayout({getItem:()=>raw}),b);assert.deepEqual(normalizePromptLayout({version:1,fields:{x:'true',y:true}}).fields,{y:true});});
