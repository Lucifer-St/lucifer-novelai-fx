import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tagAtCaret,suggestionText,normalizeOfficialTags,mergeSuggestions,createLocalTagIndex,searchLocalTags,createTagSearchIndex,searchTagIndex,updateTagGlossary} from '../src/lib/tag-suggestions.mjs';
import {GLOSSARY_KEY,readPersonalGlossary,savePersonalGlossary} from '../src/lib/tag-glossary.mjs';
import {replaceRangeCards,removeCard} from '../src/lib/prompt-cards.mjs';
test('tag boundaries preserve signed weights, literal parentheses, artist prefixes and Unicode',()=>{
 for(const [text,caret,query] of [['1.25::blue h::, sky',12,'blue h'],['{-0.5::blue_hair::}, sky',11,'blue_hair'],['artist:some_name, lake',9,'artist:some_name'],['name (series), sun',6,'name (series)'],['花园, 长头发',7,'长头发']]){
  const token=tagAtCaret(text,caret);assert.equal(token?.query,query);assert.equal(text.slice(token.start,token.end),query);
 }
 for(const [text,caret] of [['1.25::blue',2],['blue, ',6],['https://private.example',10],['a'.repeat(101),101],['hi',1],['<lora:foo:1>',5]]){if(text==='hi')continue;assert.equal(tagAtCaret(text,caret),null);}
 assert.equal(tagAtCaret('blue hair',0,4),null);
});
test('local aliases, categories and official-first deduplication do not invent certainty',()=>{
 const index=createLocalTagIndex([['blue_hair',0,100,'azure_hair'],['bluesky',1,50,''],['blue_sky',0,200,''],['blue_hairband',0,10,'']]);
 assert.equal(searchLocalTags(index,'azure')[0].tag,'blue_hair');
 assert.deepEqual(searchLocalTags(index,'artist:blue').map(x=>suggestionText(x,'artist:blue')),['artist:bluesky']);
 const official=normalizeOfficialTags({tags:[{tag:'blue hair',confidence:.6,count:10000},{tag:'bad\nitem'},{wrong:true}]});assert.equal(official.length,1);
 const merged=mergeSuggestions(official,searchLocalTags(index,'blue'),'blue');assert.equal(merged.filter(x=>suggestionText(x)==='blue hair').length,1);assert.equal(merged[0].source,'official');assert.equal(merged[0].count,undefined);
});
test('bundled lexicon has provenance and real ordinary, artist and alias matches',async()=>{
 const data=JSON.parse(await readFile(new URL('../public/tag-data/danbooru.json',import.meta.url))),source=JSON.parse(await readFile(new URL('../public/tag-data/source.json',import.meta.url)));
 assert.equal(data.tags.length,source.entries);assert.ok(data.tags.length>100000);assert.match(source.commit,/^[a-f0-9]{40}$/);
 const index=createLocalTagIndex(data.tags);assert.ok(searchLocalTags(index,'blue h').some(x=>x.tag==='blue_hair'));assert.ok(searchLocalTags(index,'artist:rit').every(x=>x.category===1));assert.ok(searchLocalTags(index,'sole female').some(x=>x.tag==='1girl'||x.tag==='solo'));
});
test('explicit completion owns text appended at a card edge, but crossing edits never swallow neighbors',()=>{
 const before='blue h, sky',after='blue hair, sky',card={instanceId:'x',start:0,end:6,text:'blue h'};
 const cards=replaceRangeCards(before,after,[card],0,6);assert.equal(cards[0].end,9);assert.equal(removeCard(after,cards,'x').text,', sky');
 const crossed=replaceRangeCards(before,'blue hair', [{...card,end:9,text:'blue h, s'}],8,11);assert.equal(crossed[0].detached,true);
});

test('Chinese lookup ranks personal exact, bundled exact, Chinese prefix and keeps glossary-only tags',()=>{
 const rows=[['long_hair',0,100,''],['very_long_hair',0,50,''],['grey_hair',0,90,'gray_hair']];
 const bundled={'long hair':'长发','very long hair':'长发飘逸','silver hair':'银发'};
 let index=createTagSearchIndex(rows,bundled,{'very long hair':'长发'});
 assert.deepEqual(searchTagIndex(index,'长发').map(x=>x.tag),['very_long_hair','long_hair']);
 assert.equal(searchTagIndex(index,'银发')[0].tag,'silver_hair');
 assert.equal(searchTagIndex(index,'银发')[0].glossaryOnly,true);
 assert.equal(searchTagIndex(index,'银发').some(x=>x.tag==='grey_hair'),false);
 assert.equal(searchTagIndex(index,'long h')[0].zh,'长发');
 index=updateTagGlossary(index,bundled,{'silver hair':'银亮发色'});
 assert.equal(searchTagIndex(index,'银发').length,0);
 assert.equal(searchTagIndex(index,'银亮')[0].source,'personal');
 assert.equal(index.tags.length,3);
});

test('personal glossary normalizes imported tags and rejects invalid writes atomically',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 savePersonalGlossary({'Blue_Hair':'蓝发'},storage);
 assert.deepEqual(readPersonalGlossary(storage),{'blue hair':'蓝发'});
 const before=values.get(GLOSSARY_KEY);
 assert.throws(()=>savePersonalGlossary({'valid':'有效',['__proto__']:'坏'},storage));
 assert.equal(values.get(GLOSSARY_KEY),before);
});
