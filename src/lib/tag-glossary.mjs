import {normalizeTag} from './tag-suggestions.mjs';

export const GLOSSARY_KEY='lucifer-zh-glossary-v1';
export const GLOSSARY_EVENT='lucifer-zh-glossary-changed';
const unsafe=new Set(['__proto__','constructor','prototype']);

export function readPersonalGlossary(storage=globalThis.localStorage){
  try{
    const parsed=JSON.parse(storage?.getItem(GLOSSARY_KEY)||'{}');
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key,value])=>typeof value==='string'&&key.length<=150&&value.length<=300&&!unsafe.has(key)&&!unsafe.has(normalizeTag(key))).map(([key,value])=>[normalizeTag(key),value.trim()]));
  }catch{return {};}
}

export function savePersonalGlossary(terms,storage=globalThis.localStorage){
  if(!terms||typeof terms!=='object'||Array.isArray(terms)||Object.keys(terms).length>20000)throw Error('个人词条不能超过 20,000 条');
  const clean={};
  for(const [key,value] of Object.entries(terms)){
    const tag=normalizeTag(key);
    if(!tag||unsafe.has(key)||unsafe.has(tag)||tag.length>150||typeof value!=='string'||!value.trim()||value.length>300)throw Error('词条格式无效');
    clean[tag]=value.trim();
  }
  storage.setItem(GLOSSARY_KEY,JSON.stringify(clean));
  globalThis.dispatchEvent?.(new Event(GLOSSARY_EVENT));
  return clean;
}

export function glossaryTerms(data){
  if(!data||data.version!==1||!data.terms||typeof data.terms!=='object'||Array.isArray(data.terms))throw Error('词典格式错误');
  return data.terms;
}

export function meaning(dictionary,key){return Object.hasOwn(dictionary,key)&&typeof dictionary[key]==='string'?dictionary[key]:'';}
