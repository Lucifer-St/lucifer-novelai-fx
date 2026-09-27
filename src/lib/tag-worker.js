import {createTagSearchIndex,searchTagIndex,updateTagGlossary} from './tag-suggestions.mjs';
let indexPromise,bundled={},personal={};
async function index(){
  if(!indexPromise)indexPromise=Promise.all([
    fetch('/tag-data/danbooru.json').then(async r=>{if(!r.ok)throw Error('词表读取失败');const data=await r.json();if(data.version!==1||!Array.isArray(data.tags))throw Error('词表格式错误');return data.tags;}),
    fetch('/glossary/zh-cn.json').then(async r=>{if(!r.ok)return {};const data=await r.json();return data.version===1&&data.terms&&typeof data.terms==='object'&&!Array.isArray(data.terms)?data.terms:{};}).catch(()=>({}))
  ]).then(([rows,terms])=>{bundled=terms;return createTagSearchIndex(rows,bundled,personal);}).catch(e=>{indexPromise=null;throw e;});
  return indexPromise;
}
self.onmessage=async ({data})=>{
  if(data.type==='glossary'){
    personal=data.terms||{};
    if(indexPromise)indexPromise=indexPromise.then(current=>updateTagGlossary(current,bundled,personal));
    return;
  }
  const {id,query}=data;
  try{self.postMessage({id,tags:searchTagIndex(await index(),query)});}catch{self.postMessage({id,error:'本地词表暂不可用'});}
};
