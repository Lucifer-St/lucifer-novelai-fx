import provenance from '../../shared/anlas-pricing.json' with {type:'json'};
export {provenance as pricingProvenance};
export function priceKey(payload){
 const body=payload?.novelai?.body||{},p=body.parameters||payload?.novelai?.parameters||{};
 const endpoint=payload?.novelai?.endpoint||'/ai/generate-image';
 return JSON.stringify({endpoint:endpoint.replace('-stream',''),model:body.model||payload?.model,action:body.action||'generate',width:p.width,height:p.height,steps:p.steps,n_samples:1,strength:p.strength,noise:p.noise,sm:p.sm,sm_dyn:p.sm_dyn,upscale:p.upscale||null,image_format:p.image_format||'png',referenceCount:p.director_reference_images?.length||0,vibeCount:p.reference_image_multiple?.length||0});
}
export function opusEligibility(payload){
 const body=payload?.novelai?.body||{},p=body.parameters||{};
 const model=body.model||payload?.model,endpoint=payload?.novelai?.endpoint,count=Number(p.n_samples??payload?.n??1);
 const v45=/^nai-diffusion-4-5-(?:full|curated)(?:-inpainting)?$/.test(model||'');
 const supported=(v45||['nai-diffusion-5-full','nai-diffusion-5-full-inpainting'].includes(model))
   &&['/ai/generate-image','/ai/generate-image-stream'].includes(endpoint)
   &&['generate','img2img','infill'].includes(body.action||'generate')
   &&!p.upscale&&!p.sm&&!p.sm_dyn&&!p.characterRef&&!p.reference_image
   &&(v45||(!p.reference_image_multiple?.length&&!p.director_reference_images?.length));
 let reason='';
 if(!supported)reason='此操作或附加参数尚不属于已核对的免费条件';
 else if(![p.width,p.height,p.steps].every(v=>Number.isFinite(v)&&v>0)||!Number.isInteger(count)||count<1||count>8)reason='尺寸、步数或张数无效';
  else if(p.width*p.height>1048576)reason='分辨率超过 1,048,576 像素';
  else if(p.steps>28)reason='步数超过 28';
  else if(v45&&(body.action||'generate')!=='generate')reason='V4.5 免费基础生图不包含图生图或局部重绘';
  else if(v45&&(p.image||p.mask))reason='使用了底图或遮罩';
  else if(v45&&p.director_reference_images?.length)reason='精准参考不符合当前官方客户端的 Opus 免费基础生图条件';
  else if(v45&&count!==1)reason='V4.5 免费条件要求单次一张';
 const qualifies=!reason;
 return {supported,qualifies,eligible:qualifies&&count===1,count,reason:reason||(count!==1?'单次请求超过一张':'符合 Opus 免费参数条件')};
}
export function quoteAnlas(payload,calibrations=[],{policy='opus'}={}){
 const body=payload?.novelai?.body||{},p=body.parameters||{},eligibility=opusEligibility(payload),count=eligibility.count;
 if(payload?.novelai?.endpoint==='/ai/encode-vibe')return {known:true,amount:2,perImage:2,paidPerImage:2,paidFallback:2,freeImages:0,chargedImages:1,source:'official_vibe_encoding',policy,conditional:false,label:'Vibe 编码 2 Anlas',reason:'仅新编码收费；已缓存编码应在发送前复用。'};
 const model=body.model||payload?.model;
 if(/^nai-diffusion-4-5-(?:full|curated)(?:-inpainting)?$/.test(model||'')){
  const referenceCount=p.director_reference_images?.length||0,vibeCount=p.reference_image_multiple?.length||0;
  const referenceExtra=5*referenceCount,vibeExtra=2*Math.max(0,vibeCount-4),extraPerImage=referenceExtra+vibeExtra;
  const found=calibrations.find(c=>c.key===priceKey(payload));
  const freeBase=policy==='opus'&&eligibility.eligible;
  if(freeBase)return {known:true,amount:extraPerImage,perImage:extraPerImage,baseAmount:0,extraPerImage,referenceExtra,vibeExtra,paidPerImage:null,paidFallback:null,freeImages:1,chargedImages:0,source:'official_v45_opus_conditional',policy,conditional:true,label:'V4.5 Opus 条件预估',reason:'仅基础生图按 Opus 条件预估为 0；精准参考和多 Vibe 附加费用仍计入。未核验实际账户资格或网关账单。'};
  if(found)return {known:true,amount:found.amount*count,perImage:found.amount,baseAmount:null,extraPerImage,referenceExtra,vibeExtra,paidPerImage:found.amount,paidFallback:found.amount*count,freeImages:0,chargedImages:count,source:'manual_calibration',policy,conditional:false,label:'手动标定预估',calibratedAt:found.updatedAt,reason:'手动单张标定视为包含参考附加费；请按官网同参数报价核对。'};
  return {known:false,amount:null,perImage:null,baseAmount:null,extraPerImage,referenceExtra,vibeExtra,paidPerImage:null,paidFallback:null,freeImages:0,chargedImages:count,source:'unverified_v45_base',policy,conditional:false,label:'V4.5 基础费用未知',reason:'精准参考和多 Vibe 附加费已知；基础生成费用未获官方当前公式核对，不能合计。'};
 }
 const found=calibrations.find(c=>c.key===priceKey(payload));let paidPerImage,source;
 if(found){paidPerImage=found.amount;source='manual_calibration';}
 else if(eligibility.supported&&[p.width,p.height,p.steps].every(v=>Number.isFinite(v)&&v>0)&&Number.isInteger(count)&&count>=1&&count<=8){
  const strength=p.mask?Number(p.inpaintImg2ImgStrength??1):body.action==='img2img'||p.image?Number(p.strength):1;
  if(Number.isFinite(strength)&&strength>=0&&strength<=1){const pixels=p.width*p.height,base=Math.ceil(2.951823174884865e-6*pixels+5.753298233447344e-7*pixels*p.steps);paidPerImage=Math.max(Math.ceil(base*1.5*strength),2);source='official_v5_paid_estimate';}
 }
 if(paidPerImage===undefined)return {known:false,amount:null,perImage:null,source:'unverified',label:'暂无法估算',reason:'此操作尚未核对；可以手动记录官网单张价格。'};
 // Official GI subtracts one eligible sample; a two-image batch still pays for one.
 const freeImages=policy==='opus'&&eligibility.qualifies?1:0,amount=paidPerImage*(count-freeImages);
 return {known:true,amount,perImage:freeImages?0:paidPerImage,paidPerImage,paidFallback:paidPerImage*count,freeImages,chargedImages:count-freeImages,source:freeImages?'official_opus_conditional':source,policy,conditional:!!freeImages,label:freeImages?'Opus 条件预估':source==='manual_calibration'?'手动标定预估':'V5 付费规则预估',calibratedAt:found?.updatedAt,clientBuild:provenance.clientBuild,reason:freeImages?'假设上游账号是有效 Opus 且 V5 免费额度足够；仍消耗 Opus 用量额度。网关实际计费未核验。':'未使用 Opus 免费权益；不等于实时余额或网关账单。'};
}
