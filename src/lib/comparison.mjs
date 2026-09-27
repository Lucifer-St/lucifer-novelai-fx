import {buildRequest,validateRequest,newSeed} from './request.mjs';
import {opusEligibility} from './anlas.mjs';
export const COMPARISON_FIELDS=['prompt','negative','promptCards','negativeCards','characters','coords','quality','qualityPreset','steps','scale','sampler','cfg_rescale','strength','noise','overrides','extraJSON'];
export function comparisonDefaults(saved={}){return {version:1,enabled:false,noAnlas:!!saved.noAnlas,mode:saved.mode==='AB'?'AB':'ABC',rounds:1,locked:saved.locked!==false,overrides:{B:saved.overrides?.B||{},C:saved.overrides?.C||{}}};}
export function variantState(base,config,variant='A'){
 if(variant==='A')return base;const changes=config.overrides?.[variant]||{};
 return {...base,...Object.fromEntries(Object.entries(changes).filter(([key])=>COMPARISON_FIELDS.includes(key)))};
}
export function variantDiff(base,config,variant){const state=variantState(base,config,variant);return COMPARISON_FIELDS.filter(k=>!k.endsWith('Cards')&&JSON.stringify(base[k])!==JSON.stringify(state[k])).map(key=>({key,before:base[key],after:state[key]}));}
export function planComparison(base,config,{seedFactory=newSeed}={}){
 if(!config.enabled||!['AB','ABC'].includes(config.mode))throw new Error('请先开启 A/B/C 对照。');
 const rounds=Number(config.rounds);if(!Number.isInteger(rounds)||rounds<1||rounds>20)throw new Error('对照轮数须为 1–20。');
 const labels=config.mode==='AB'?['A','B']:['A','B','C'];const jobs=[];
 const first=config.locked&&Number(base.seed)>=0?Number(base.seed):seedFactory();
 for(let round=1;round<=rounds;round++){
  const seed=config.locked?first:round===1?first:seedFactory();
  for(const variant of labels){const state=structuredClone(variantState(base,config,variant));state.seed=seed;state.n=1;state.stream=false;
   // Comparison-level seed/count take precedence over imported expert settings.
   delete state.overrides.seed;delete state.overrides.n_samples;
   const extra=JSON.parse(state.extraJSON||'{}');delete extra.seed;delete extra.n_samples;state.extraJSON=JSON.stringify(extra);
   const payload=validateRequest(state,buildRequest(state,{resolveSeed:true}));
   if(config.noAnlas){const check=opusEligibility(payload);if(!check.eligible)throw new Error(`方案 ${variant} 不符合 0 Anlas 模式：${check.reason}。本组尚未提交。`);}
   jobs.push({round,variant,seed,payload,state,diff:variantDiff(base,config,variant)});
  }
 }
 return {version:1,noAnlas:!!config.noAnlas,mode:config.mode,rounds,locked:!!config.locked,jobs};
}
