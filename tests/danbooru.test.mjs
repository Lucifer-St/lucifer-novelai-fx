import test from 'node:test';import assert from 'node:assert/strict';
import {buildDanbooruQuery,createDanbooru,normalizeDanbooruPost,danbooruMediaUrl,danbooruCandidateUrls} from '../server/danbooru.mjs';
import {createFeatures} from '../server/features.mjs';
import {initialTagSelection,selectedDanbooruTags,danbooruTagKey,initialDanbooruPreferences,danbooruPageSize,parseDanbooruPage} from '../src/lib/danbooru.mjs';
const raw={id:123,rating:'g',file_ext:'png',tag_string_artist:'test_artist',tag_string_general:'blue_sky landscape',tag_string_meta:'highres',file_url:'https://cdn.donmai.us/original/a.png',preview_file_url:'https://cdn.donmai.us/180x180/a.jpg',media_asset:{variants:[{type:'360x360',url:'https://cdn.donmai.us/360x360/a.jpg'},{type:'720x720',url:'https://cdn.donmai.us/720x720/a.webp'}]}};
test('page jumps accept only explicit integer pages 1 through 1000',()=>{
 for(const value of ['',0,-1,1001,10000,'1.5','1e2','2abc','Infinity'])assert.equal(parseDanbooruPage(value),null);
 for(const [value,page] of [[1,1],[' 7 ',7],['0012',12],[1000,1000]])assert.equal(parseDanbooruPage(value),page);
});
test('explicit page refresh bypasses metadata cache once and retains rate limits and upstream semantics',async()=>{
 let now=10000,calls=0;const client=createDanbooru({now:()=>now,fetchImpl:async url=>{calls++;assert.equal(url.searchParams.get('refresh'),null);assert.equal(url.searchParams.get('page'),'7');assert.equal(url.searchParams.get('limit'),'16');return Response.json([{...raw,id:100+calls}]);}});
 const query=new URLSearchParams({page:'7',pageSize:'16'}),refresh=new URLSearchParams({...Object.fromEntries(query),refresh:'1'});
 assert.equal((await client.posts(query)).posts[0].id,101);assert.equal((await client.posts(query)).cached,true);assert.equal(calls,1);
 await assert.rejects(client.posts(refresh),error=>error.status===429);assert.equal(calls,1);now+=1000;
 assert.equal((await client.posts(refresh)).posts[0].id,102);assert.equal(calls,2);assert.equal((await client.posts(query)).posts[0].id,102);assert.equal(calls,2);
});
test('gallery query maps rating, score/favorite sorting, UTC time and pagination',()=>{
 const s=buildDanbooruQuery(new URLSearchParams({q:'landscape',rating:'e',sort:'score',period:'week',page:'2'}),Date.parse('2026-09-22T05:00Z'));
 assert.equal(s.query,'landscape rating:e order:score date:>=2026-09-15');assert.equal(s.url.origin,'https://danbooru.donmai.us');assert.equal(s.url.searchParams.get('page'),'2');assert.equal(s.url.searchParams.get('limit'),'12');
 assert.match(buildDanbooruQuery(new URLSearchParams({rating:'all',sort:'favorites'})).query,/^order:favcount$/);
 assert.throws(()=>buildDanbooruQuery(new URLSearchParams({q:'rating:e'})),/筛选器/);assert.throws(()=>buildDanbooruQuery(new URLSearchParams({page:'1.2'})));assert.throws(()=>buildDanbooruQuery(new URLSearchParams({q:'a'.repeat(241)})));
});
test('gallery normalization limits media to Danbooru HTTPS and hides unavailable ratings/posts',()=>{
 const p=normalizeDanbooruPost(raw);assert.equal(p.original,raw.file_url);assert.match(p.thumbnail,/360x360/);assert.match(p.preview,/720x720/);
 for(const url of ['http://cdn.donmai.us/a.jpg','https://cdn.donmai.us.attacker.test/a.jpg','https://key@cdn.donmai.us/a.jpg','data:image/png,AA','https://127.0.0.1/a.jpg'])assert.equal(danbooruMediaUrl(url),null);
 assert.equal(normalizeDanbooruPost({...raw,is_deleted:true}),null);assert.equal(normalizeDanbooruPost({...raw,file_ext:'webm'}).original,null);
});
test('whole-row page limits remain bounded and use the same upstream size on later pages',async()=>{
 assert.equal(danbooruPageSize(1330),16);assert.equal(danbooruPageSize(900),15);assert.equal(danbooruPageSize(330,{columns:2,gap:8}),12);assert.equal(danbooruPageSize(0),0);
 for(const pageSize of ['0','11','49','12.5','bad'])assert.throws(()=>buildDanbooruQuery(new URLSearchParams({pageSize})),/筛选参数/);
 let now=10000;const sizes=[];const client=createDanbooru({now:()=>now,fetchImpl:async url=>{sizes.push(url.searchParams.get('limit'));assert.equal(url.searchParams.get('page'),'2');return Response.json(Array.from({length:17},(_,i)=>({...raw,id:123+i})));}});
 for(const pageSize of [16,15]){const result=await client.posts(new URLSearchParams({page:'2',pageSize:String(pageSize)}));assert.equal(result.posts.length,pageSize);assert.equal(result.pageSize,pageSize);assert.equal(result.hasMore,true);assert.equal(new URL(result.sourceUrl).searchParams.get('limit'),String(pageSize));now+=1000;}assert.deepEqual(sizes,['16','15']);
});
test('public gallery client has no auth and caches, deduplicates, filters rating, and never visits the gateway',async()=>{
 let calls=[],resolve;const body=new Promise(r=>resolve=r);let now=10000;
 const g=createDanbooru({now:()=>now,fetchImpl:async(url,init)=>{calls.push({url,init});await body;return Response.json([raw,{...raw,id:124,rating:'e'}]);}});
 const a=g.posts(new URLSearchParams()),b=g.posts(new URLSearchParams());assert.equal(calls.length,1);resolve();const x=await a;await b;
 assert.equal(x.posts.length,1);assert.equal(calls[0].url.hostname,'danbooru.donmai.us');assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.headers.Authorization,undefined);assert.equal(calls[0].init.credentials,'omit');
 assert.equal((await g.posts(new URLSearchParams())).cached,true);assert.equal(calls.length,1);
 await assert.rejects(g.posts(new URLSearchParams({q:'blue_sky'})),e=>e.status===429);now+=1000;
 await g.posts(new URLSearchParams({rating:'all'}));assert.equal(calls.length,2);
});
test('gallery upstream errors and malformed results are actionable and never automatically retried',async()=>{
 for(const response of [new Response('blocked',{status:403}),new Response('limited',{status:429}),new Response('<html>captcha</html>'),Response.json({message:'bad'})]){
  let calls=0;const g=createDanbooru({fetchImpl:async()=>{calls++;return response;}});await assert.rejects(g.posts(new URLSearchParams()),e=>e.status===502||e.status===429);assert.equal(calls,1);
 }
});
test('database query timeout is distinct, bounded and never changes filters or retries',async()=>{
 for(const [body,code] of [[JSON.stringify({error:'ActiveRecord::QueryCanceled',message:'The database timed out running your query.'}),'danbooru_query_timeout'],[JSON.stringify({error:'OtherError'}),'danbooru_upstream'],['<html>error</html>','danbooru_upstream'],['x'.repeat(16385),'danbooru_upstream']]){
  let calls=0;const g=createDanbooru({fetchImpl:async(url,init)=>{calls++;assert.equal(url.searchParams.get('tags'),'landscape order:favcount favcount:>=100');assert.equal(init.method,'GET');assert.equal(init.headers.Authorization,undefined);return new Response(body,{status:500});}});
  await assert.rejects(g.posts(new URLSearchParams({q:'landscape',rating:'all',sort:'favorites'})),e=>e.code===code&&e.status===(code==='danbooru_query_timeout'?504:502));assert.equal(calls,1);
 }
});
test('all-time candidate windows preserve original query, URL, requested page and exact negative-score tail',async()=>{
 // A controlled upstream with equal scores, negative scores, banned records and
 // non-selected ratings proves decisions use RAW row counts, before UI filtering.
 const rows=Array.from({length:44},(_,i)=>({...raw,id:1000-i,score:i<19?150:i<27?0:-5,fav_count:i<19?150:i<27?0:-5,is_banned:i===3,rating:i===5?'e':'g'}));
 for(const sort of ['score','favorites'])for(const page of [1,2,3,4]){
  const calls=[],field=sort==='score'?'score':'favcount';
  const g=createDanbooru({fetchImpl:async url=>{
   const tags=url.searchParams.get('tags');calls.push(tags);
   const threshold=tags.match(new RegExp(`${field}:>=(\\d+)`));
   const matches=rows.filter(row=>!threshold||row.score>=Number(threshold[1]));
   const offset=(Number(url.searchParams.get('page'))-1)*12;
   return Response.json(matches.slice(offset,offset+12));
  }});
  const result=await g.posts(new URLSearchParams({sort,page:String(page)}));
  const expected=rows.slice((page-1)*12,page*12).map(normalizeDanbooruPost).filter(p=>p&&p.rating==='g');
  assert.deepEqual(result.posts,expected);assert.equal(result.ranking,'exact');
  assert.equal(result.query,`rating:g order:${field}`);assert.equal(new URL(result.sourceUrl).searchParams.get('tags'),result.query);
  assert.equal(result.hasMore,rows.slice((page-1)*12,page*12).length===12);
  assert.equal(new Set(result.posts.map(p=>p.id)).size,result.posts.length);
  assert.equal(calls.length,page===1?1:page===2?2:3);
 }
});
test('candidate expansion is bounded and never retries an HTTP failure or exposes an incomplete window',async()=>{
 for(const [status,expectedCalls] of [[429,1],[500,1]]){
  let calls=0;const g=createDanbooru({fetchImpl:async()=>{calls++;return Response.json({error:'broken'},{status});}});
  await assert.rejects(g.posts(new URLSearchParams({sort:'score'})));assert.equal(calls,expectedCalls);
 }
 let calls=0;const g=createDanbooru({fetchImpl:async()=>{calls++;return calls===3?new Response('failed',{status:503}):Response.json([raw]);}});
 await assert.rejects(g.posts(new URLSearchParams({sort:'score'})),e=>e.code==='danbooru_upstream');assert.equal(calls,3);
 for(const params of [{sort:'latest'},{sort:'score',period:'week'},{sort:'score',q:'score:<0'},{sort:'favorites',q:'-favcount:0'},{sort:'score',q:'landscape or scenery'},{sort:'score',q:'~blue_sky ~sunset'},{sort:'score',q:'( landscape sunset )'}]){
  const query=buildDanbooruQuery(new URLSearchParams(params));assert.deepEqual(danbooruCandidateUrls(query),[query.url]);
 }
});
test('new feature remains lazy and only the Danbooru route initializes its public client',async()=>{
 let calls=0;const f=createFeatures({dataDir:'.local/fx-danbooru-unused-test',generate:()=>{throw Error('generation forbidden');},fetchImpl:async()=>{calls++;return Response.json([raw]);}});assert.equal(calls,0);
 const result=await f.handle(new URL('http://localhost/api/danbooru/posts'),'GET');assert.equal(calls,1);assert.equal(result.posts[0].id,123);
});
test('selective copy converts artist tags only when requested and leaves raw tags intact',()=>{
 const p=normalizeDanbooruPost(raw),set=initialTagSelection(p);assert.equal(selectedDanbooruTags(p,set),'artist:test artist, blue sky, landscape');assert.equal(selectedDanbooruTags(p,set,false),'test_artist, blue_sky, landscape');
 set.delete(danbooruTagKey('artist','test_artist'));assert.equal(selectedDanbooruTags(p,set),'blue sky, landscape');assert.equal(raw.tag_string_meta,'highres');
 assert.equal(initialDanbooruPreferences({getItem:()=>'{bad'}).rating,'g');assert.equal(initialDanbooruPreferences({getItem:()=>JSON.stringify({rating:'q',page:88})}).page,1);
});

test('image proxy accepts only CDN image paths, supplies the site referer and never forwards credentials',async()=>{
 const calls=[];const g=createDanbooru({fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(Buffer.from('fixture'),{headers:{'content-type':'image/png'}});}});
 for(const url of ['https://evil.test/a.png','https://cdn.donmai.us/api/users.json','https://cdn.donmai.us/original/a.png?api_key=secret','http://cdn.donmai.us/original/a.png'])await assert.rejects(g.media(url));
 assert.equal(calls.length,0);const a=await g.media('https://cdn.donmai.us/360x360/a.png');assert.equal(a.contentType,'image/png');assert.equal(calls[0].init.headers.Referer,'https://danbooru.donmai.us/');assert.equal(calls[0].init.headers.Authorization,undefined);assert.equal(calls[0].init.headers.Cookie,undefined);assert.equal(calls[0].init.redirect,'error');
 await g.media('https://cdn.donmai.us/360x360/a.png');assert.equal(calls.length,1);
 const blocked=createDanbooru({fetchImpl:async()=>new Response('<html/>',{headers:{'content-type':'text/html'}})});await assert.rejects(blocked.media('https://cdn.donmai.us/original/a.png'),/未返回图片/);
});
