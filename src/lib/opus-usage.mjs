import {quoteAnlas,opusEligibility} from './anlas.mjs';
export const OPUS_ESTIMATE_VERSION='official-faq-1730-reference-v1';
export function opusEstimate(payload,policy){
 const model=payload?.novelai?.body?.model||payload?.model;
 if(!['nai-diffusion-5-full','nai-diffusion-5-full-inpainting'].includes(model))return {percent:null,source:OPUS_ESTIMATE_VERSION,reason:'V4.5 不消耗 V5 Opus 用量额度'};
 const q=quoteAnlas(payload,[],{policy}),eligible=opusEligibility(payload);
 if(policy!=='opus'||!eligible.qualifies)return {percent:null,source:OPUS_ESTIMATE_VERSION,reason:'无法确认此请求消耗 Opus 免费额度'};
 return {percent:(q.paidPerImage/26)*(100/1730),source:OPUS_ESTIMATE_VERSION,reason:'按官方约 1730 张标准图片满额度参考折算；非实际扣量'};
}
export function summarizeUsage(entries,{now=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone,usage=null}={}){
 let format;try{format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{throw Error('无效时区');}
 const day=format.format(now),unique=[...new Map(entries.map(e=>[e.id,e])).values()],today=unique.filter(e=>format.format(new Date(e.createdAt))===day);
 const known=today.filter(e=>e.status==='success'&&Number.isFinite(e.opusPercent)),pending=today.filter(e=>e.billingUnknown||e.status!=='success');
 const estimatedPercent=known.reduce((sum,e)=>sum+e.opusPercent,0),seconds=Number(usage?.timeUntilNextPercent),dailyRecovery=seconds>0?86400/seconds:null;
 return {date:day,timeZone,estimatedPercent,knownRequests:known.length,unknownRequests:today.length-known.length,uncertainRequests:pending.length,dailyRecoveryPercent:dailyRecovery,dailyRecoveryRatio:dailyRecovery?estimatedPercent/dailyRecovery*100:null,referenceVersion:OPUS_ESTIMATE_VERSION,accountWide:false};
}
