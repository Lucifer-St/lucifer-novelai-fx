import path from 'node:path';
import {createLibrary,FeatureError} from './local-store.mjs';
import {createComparisons} from './comparisons.mjs';
import {createAnlas} from './anlas.mjs';

export function createFeatures({dataDir,generate,fetchImpl=fetch}){
 const library=createLibrary(path.join(dataDir,'library')),anlas=createAnlas(path.join(dataDir,'usage'));
 const comparisons=createComparisons(path.join(dataDir,'comparisons'),generate);
 let danbooruPromise;
 const danbooru=()=>danbooruPromise??=import('./danbooru.mjs').then(({createDanbooru})=>createDanbooru({fetchImpl}));
 return {library,anlas,comparisons,
  async danbooruImage(url,signal){return (await danbooru()).media(url,signal);},
  async handle(url,method,body){
   const p=url.pathname;
   if(p==='/api/danbooru/posts'&&method==='GET')return (await danbooru()).posts(url.searchParams);
   if(p==='/api/library'&&method==='GET')return {entries:await library.list({query:url.searchParams.get('q')||'',kind:url.searchParams.get('kind')||'',today:url.searchParams.get('today')==='1'})};
   if(p==='/api/library'&&method==='POST')return library.put(body);
   if(p==='/api/library/categories'&&method==='GET')return {categories:await library.categories()};
   if(p==='/api/library/categories'&&method==='POST')return {categories:await library.addCategory(body.name)};
   if(p==='/api/library/export'&&method==='GET')return library.export();
   if(p==='/api/library/import'&&method==='POST')return {entries:await library.import(body)};
   let match=p.match(/^\/api\/library\/([a-f0-9-]+)(\/restore)?$/);if(match){if(method==='GET')return library.get(match[1]);if(method==='DELETE')return library.archive(match[1]);if(method==='POST'&&match[2])return library.archive(match[1],true);}
   if(p==='/api/comparisons'&&method==='GET')return {entries:await comparisons.list(),active:comparisons.active};
   if(p==='/api/comparisons'&&method==='POST'){if(body.config?.noAnlas&&(await anlas.get()).pricingPolicy==='paid')throw new FeatureError('当前计数规则是付费 / 额度用尽；请先核实 Opus 额度，再开启 0 Anlas 模式。');return comparisons.start(body.state,body.config);}
   match=p.match(/^\/api\/comparisons\/([a-f0-9-]+)(\/stop)?$/);if(match){if(method==='GET')return comparisons.get(match[1],{full:url.searchParams.get('full')==='1'});if(method==='POST'&&match[2])return comparisons.stop(match[1]);}
   if(p==='/api/anlas'&&method==='GET')return anlas.get();
   if(p==='/api/anlas'&&method==='POST')return anlas.update(body);
   if(p==='/api/anlas/quote'&&method==='POST')return Array.isArray(body.payloads)?anlas.quotes(body.payloads):anlas.quote(body.payload);
   if(p==='/api/artists'&&method==='POST'){const {lookupArtist}=await import('./artists.mjs');return lookupArtist(body,fetchImpl);}
   throw new FeatureError('接口不存在。','not_found',404);
  },
 };
}
