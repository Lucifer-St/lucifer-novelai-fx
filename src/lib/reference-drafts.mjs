import {MODEL_IDS,isReferenceParameter} from './model-policy.mjs';
export const referencePart=state=>({vibes:state?.vibes||[],precise:state?.precise||[],referenceMode:state?.referenceMode||'off',normalize:state?.normalize??true});
export function mergeReferenceDrafts(initial,current,saved={}){
 if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('参考图草稿格式无效。');
 const modelDrafts={...current.modelDrafts};
 for(const model of MODEL_IDS){
  const before=referencePart(initial.model===model?initial:initial.modelDrafts?.[model]);
  const now=referencePart(current.model===model?current:current.modelDrafts?.[model]);
  const stored=saved[model]?referencePart(saved[model]):null;
  const merged=Object.fromEntries(Object.keys(now).map(key=>[key,stored&&JSON.stringify(before[key])===JSON.stringify(now[key])?stored[key]:now[key]]));
  modelDrafts[model]={...modelDrafts[model],...merged};
 }
 return {...current,...referencePart(modelDrafts[current.model]),modelDrafts};
}

export function changeReferenceMode(state,mode){
 let extraJSON=state.extraJSON;
 try{extraJSON=JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(extraJSON||'{}')).filter(([key])=>!isReferenceParameter(key))),null,2);}catch{/* Preserve invalid manual JSON. */}
 return {...state,referenceMode:mode,extraJSON,overrides:Object.fromEntries(Object.entries(state.overrides||{}).filter(([key])=>!isReferenceParameter(key)))};
}
