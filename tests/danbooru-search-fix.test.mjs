import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {buildDanbooruQuery,createDanbooru} from '../server/danbooru.mjs';
import {normalizeDanbooruSearch,danbooruSearchTags} from '../src/lib/danbooru-search.mjs';
import {createTagSearchIndex,searchTagIndex} from '../src/lib/tag-suggestions.mjs';
import {danbooruToken,completeDanbooruToken} from '../src/lib/danbooru-completion.mjs';
test('latest two-tag search omits the counted order metatag and keeps rating/time/paging',()=>{
 for(const q of ['1girl 1boy','1girl, 1boy','1girl，1boy']){const s=buildDanbooruQuery(new URLSearchParams({q,rating:'all',sort:'latest',page:'2',pageSize:'16'}));assert.equal(s.query,'1girl 1boy');assert.equal(new URL(s.sourceUrl).searchParams.get('tags'),s.query);assert.equal(s.url.searchParams.get('page'),'2');assert.equal(s.url.searchParams.get('limit'),'16');}
 const s=buildDanbooruQuery(new URLSearchParams({q:'1girl 1boy',rating:'g',sort:'latest',period:'week'}),Date.parse('2026-09-29T12:00:00Z'));assert.equal(s.query,'1girl 1boy rating:g date:>=2026-09-22');
 assert.equal(danbooruSearchTags({q:'1girl',rating:'all',sort:'score',period:'all'}),'1girl order:score');
 assert.equal(normalizeDanbooruSearch('name_(a,b), blue_hair'),'name_(a,b) blue_hair');assert.equal(normalizeDanbooruSearch('source:"a,b"'),'source:"a,b"');
 assert.throws(()=>buildDanbooruQuery(new URLSearchParams({q:'a\nb'})),/空格/);
});
test('tag limit is distinguished from other 422 errors, without retries or silently changed sorting',async()=>{
 for(const [detail,code] of [[{error:'PostQuery::TagLimitError'},'danbooru_tag_limit'],[{error:'PostQuery::Error'},'danbooru_invalid_query'],['<html>bad</html>','danbooru_invalid_query']]){
  let count=0;const client=createDanbooru({fetchImpl:async url=>{count++;assert.match(url.searchParams.get('tags'),/order:score/);return new Response(typeof detail==='string'?detail:JSON.stringify(detail),{status:422});}});
  await assert.rejects(client.posts(new URLSearchParams({q:'1girl 1boy',sort:'score',rating:'all'})),e=>e.code===code&&e.status===422&&(code!=='danbooru_tag_limit'||e.message.includes('排序占 1 项')));assert.equal(count,1);
 }
});
test('actual bundled glossary finds interior Chinese words and retains personal exact priority',async()=>{
 const rows=JSON.parse(await readFile(new URL('../public/tag-data/danbooru.json',import.meta.url))).tags,terms=JSON.parse(await readFile(new URL('../public/glossary/zh-cn.json',import.meta.url))).terms;
 const index=createTagSearchIndex(rows,terms);assert.equal(searchTagIndex(index,'男孩')[0].tag,'1boy');assert.equal(searchTagIndex(index,'女孩')[0].tag,'1girl');assert.equal(searchTagIndex(index,'蓝发')[0].tag,'blue_hair');
 const personal=createTagSearchIndex(rows,terms,{'2boys':'男孩'});assert.equal(searchTagIndex(personal,'男孩')[0].tag,'2boys');
 const value='1girl,男孩',token=danbooruToken(value,value.length);assert.equal(token.query,'男孩');assert.equal(completeDanbooruToken(token,'1boy').value,'1girl,1boy');
});
