import {opusEligibility} from './anlas.mjs';
import {schema,validateRequest} from './request.mjs';

// This is a parameter gate, not an upstream billing guarantee.
export function planOpusBatch(payload){
 const body=payload?.novelai?.body,p=body?.parameters,count=p?.n_samples;
 if(body?.model!=='nai-diffusion-5-full'||body.action!=='generate'||!['/ai/generate-image','/ai/generate-image-stream'].includes(payload?.novelai?.endpoint))throw Error('逐张模式目前只支持 V5 Full 普通文生图。');
 if(!Number.isInteger(count)||count<2||count>8)throw Error('多图逐张模式需要 2–8 张图片。');
 if(Object.keys(body).some(k=>!['model','action','input','parameters'].includes(k)))throw Error('逐张模式不接受未核验的原生请求扩展。');
 if(Object.keys(payload.novelai).some(k=>!['body','endpoint','response'].includes(k)))throw Error('逐张模式不接受额外网关覆盖参数。');
 const unknown=Object.keys(p).find(k=>!Object.hasOwn(schema.imageParameters,k));
 if(unknown)throw Error(`逐张模式尚未核验扩展参数 ${unknown}。`);
 if(p.image||p.mask||p.img2img||p.upscale||p.upscaled_enhance||p.controlnet_condition||p.controlnet_model||p.reference_image||p.reference_image_multiple?.length||p.director_reference_images?.length)throw Error('逐张模式不支持源图、重绘、放大或图像参考。');
 const eligibility=opusEligibility(payload);
 if(!eligibility.qualifies)throw Error(`不符合 Opus 免费参数条件：${eligibility.reason}。`);
 validateRequest({prompt:body.input},payload);
 return Array.from({length:count},(_,index)=>{
  const next=structuredClone(payload),params=next.novelai.body.parameters;
  next.n=1;params.n_samples=1;params.seed=(p.seed+index)>>>0;
  if(Number.isInteger(params.extra_noise_seed))params.extra_noise_seed=(params.extra_noise_seed+index)>>>0;
  return next;
 });
}
