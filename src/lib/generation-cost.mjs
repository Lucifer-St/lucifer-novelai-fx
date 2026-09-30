import {quoteAnlas} from './anlas.mjs';
import {buildRequest} from './request.mjs';
import {comparisonRequestState} from './comparison.mjs';

// Quote each actual single-image variant once, then multiply by rounds. Do not
// allocate a complete generation plan (and its image copies) while typing.
export function quoteComparisonTotal(base,config,calibrations=[],policy='opus'){
 try{
  if(!['AB','ABC'].includes(config.mode)||!Number.isInteger(config.rounds)||config.rounds<1||config.rounds>20)return null;
  const variants=config.mode==='AB'?['A','B']:['A','B','C'];
  const quotes=variants.map(variant=>quoteAnlas(buildRequest(comparisonRequestState(base,config,variant,0)),calibrations,{policy}));
  return quotes.every(quote=>quote.known&&Number.isFinite(quote.amount))?quotes.reduce((sum,quote)=>sum+quote.amount,0)*config.rounds:null;
 }catch{return null;}
}
export function generationCostDisplay(amount,{busy=false,comparison=false,policy='opus'}={}){
 if(busy)return {text:'…',description:'任务进行中；当前按钮不显示下一次编辑参数的费用。'};
 if(!Number.isFinite(amount)||amount<0)return {text:'—',description:'本次费用暂无法估算，不代表 0 Anlas。可在 Anlas 面板核对或手动标定。'};
 const scope=comparison?'整个对照组':'本次生成';
 return {text:String(amount),description:`${scope}预计消耗 ${amount} Anlas。${amount===0&&policy==='opus'?'按有效 Opus 且免费额度足够估算，V5 仍消耗用量额度。':'本地预估，以上游实际结算为准。'}`};
}
