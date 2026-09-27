import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {insertCard,removeCard,rebaseCards,cardSnapshot} from '../src/lib/prompt-cards.mjs';
import {createLibrary} from '../server/local-store.mjs';
import {quoteAnlas,opusEligibility,pricingProvenance} from '../src/lib/anlas.mjs';
import {defaults,buildRequest,exportPreset} from '../src/lib/request.mjs';
import {comparisonDefaults,planComparison,variantState} from '../src/lib/comparison.mjs';

const card={id:'library-id',title:'水彩画风',category:'画风',text:'watercolor'};
test('card insertion and removal preserve surrounding prompt, including duplicate words',()=>{
 const original='watercolor, blue sky';const edit=insertCard(original,original.length,original.length,card);
 assert.equal(edit.text,'watercolor, blue sky, watercolor');assert.equal(removeCard(edit.text,edit.cards,edit.cards[0].instanceId).text,original);
 const replaced=insertCard('blue sky',0,4,card);assert.equal(replaced.text,'watercolor sky');assert.equal(removeCard(replaced.text,replaced.cards,replaced.cards[0].instanceId).text,' sky');
 const again=insertCard(replaced.text,0,10,{...card,title:'油画',text:'oil paint'},replaced.cards);assert.equal(again.cards.length,1);assert.equal(again.cards[0].title,'油画');
});
test('card ranges track independent text edits and detach safely for crossing replacements',()=>{
 const inserted=insertCard('blue sky',8,8,card),id=inserted.cards[0].instanceId;
 const longer='bright '+inserted.text;let cards=rebaseCards(inserted.text,longer,inserted.cards);assert.equal(removeCard(longer,cards,id).text,'bright blue sky');
 const changed=longer.replace('watercolor','oil paint');cards=rebaseCards(longer,changed,cards);assert.equal(cards[0].edited,true);assert.equal(removeCard(changed,cards,id).text,'bright blue sky');
 const crossed='completely new words';cards=rebaseCards(changed,crossed,cards);assert.equal(cards[0].detached,true);assert.equal(removeCard(crossed,cards,id).text,crossed);
});
test('card metadata remains local, survives full preset/draft state, and stays independent between variants',()=>{
 const base={...defaults(),prompt:'watercolor',promptCards:[cardSnapshot(card,0,10,'watercolor')],source:'data:image/png;base64,abc',mask:'private-mask'};
 const config={...comparisonDefaults(),enabled:true,overrides:{B:{prompt:'a lake',promptCards:[]},C:{}}};
 assert.equal(variantState(base,config,'A').promptCards.length,1);assert.equal(variantState(base,config,'B').promptCards.length,0);
 assert.ok(!JSON.stringify(buildRequest(base)).includes('library-id'));const preset=exportPreset(base);assert.equal(preset.state.promptCards.length,1);assert.equal(preset.state.source,'');assert.equal(preset.state.mask,'');
});
test('card categories and separate full presets import/export without overwriting legacy records',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fx-cards-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const lib=createLibrary(dir);
 const categories=await lib.addCategory('镜头');assert.ok(categories.includes('服装'));assert.ok(categories.includes('镜头'));
 const a=await lib.put({...card,kind:'snippet',id:undefined});const b=await lib.put({kind:'preset',title:'完整场景',category:'场景',text:'lake',payload:{state:{...defaults(),prompt:'lake',steps:23,scale:5}}});assert.equal((await lib.get(b.id)).payload.state.steps,23);
 const bundle=await lib.export();assert.ok(bundle.categories.includes('镜头'));await lib.import(bundle);assert.equal((await lib.list()).length,4);assert.equal((await lib.get(a.id)).title,'水彩画风');
});
test('Opus estimate matches single, batch, size, steps and paid fallback rules',()=>{
 const state={...defaults(),prompt:'a garden',width:832,height:1216,steps:25,n:1};
 assert.equal(quoteAnlas(buildRequest(state)).amount,0);assert.equal(quoteAnlas(buildRequest(state)).paidFallback,27);
 assert.equal(quoteAnlas(buildRequest({...state,n:2})).amount,27);assert.equal(quoteAnlas(buildRequest({...state,n:3})).amount,54);
 assert.equal(quoteAnlas(buildRequest({...state,width:1024,height:1024,steps:28})).amount,0);
 assert.ok(quoteAnlas(buildRequest({...state,width:1088,height:1024})).amount>0);
 assert.ok(quoteAnlas(buildRequest({...state,steps:29})).amount>0);
 assert.equal(quoteAnlas(buildRequest(state),[],{policy:'paid'}).amount,27);
 assert.equal(opusEligibility(buildRequest({...state,n:2})).eligible,false);
});
test('0 Anlas comparison preflight checks every variant before submitting anything',()=>{
 const state={...defaults(),prompt:'a garden',steps:25,n:4},config={...comparisonDefaults(),enabled:true,noAnlas:true,mode:'ABC',rounds:2,overrides:{B:{},C:{steps:29}}};
 assert.throws(()=>planComparison(state,config),/方案 C.*28/);config.overrides.C.steps=28;
 const plan=planComparison(state,config);assert.equal(plan.jobs.length,6);assert.ok(plan.jobs.every(j=>j.payload.novelai.body.parameters.n_samples===1&&quoteAnlas(j.payload).amount===0));
});

test('Opus and depleted-allowance prices match independently evaluated official client fixtures',()=>{
 for(const f of pricingProvenance.opus.fixtures){const payload={model:'nai-diffusion-5-full',novelai:{endpoint:'/ai/generate-image',body:{model:'nai-diffusion-5-full',action:'generate',parameters:f.parameters}}};assert.equal(quoteAnlas(payload).amount,f.expected);assert.equal(quoteAnlas(payload,[],{policy:'paid'}).amount,f.paidFallback);}
});
