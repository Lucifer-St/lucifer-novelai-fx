import {buildRequest} from './request.mjs';
import {opusEligibility} from './anlas.mjs';
export const OPUS_PIXEL_LIMIT=1048576;
export function dimensionCostHint(state,{policy='opus',comparisonEnabled=false}={}){
 try{
  const payload=buildRequest(state),p=payload.novelai.body.parameters;
  if(comparisonEnabled)p.n_samples=1;
  const pixels=p.width*p.height;if(!Number.isFinite(pixels)||pixels<=0)throw Error('invalid size');
  const size=`${p.width} × ${p.height} = ${pixels.toLocaleString('en-US')} 像素`,boundary='Opus 免费尺寸上限为 1,048,576 像素（1024 × 1024 的总面积）';
  if(pixels>OPUS_PIXEL_LIMIT)return {level:'warning',title:'尺寸超出 Opus 免费范围',detail:`${size}；${boundary}。此尺寸需要按 Anlas 计费。`};
  if(policy==='paid')return {level:'warning',title:'当前按 Anlas 付费规则计算',detail:`${size}；虽未超过免费尺寸，当前选择了付费／额度用尽规则。`};
  const eligibility=opusEligibility(payload);
  return {level:eligibility.qualifies?'info':'warning',title:eligibility.qualifies?'尺寸在 Opus 免费范围内':'尺寸未超限，但其他参数可能收费',detail:`${size}；${boundary}。${eligibility.qualifies?'免费还需满足步数、单张／逐张模式、有效 Opus 及剩余额度等条件。':eligibility.reason+'。'}`};
 }catch{return {level:'unknown',title:'暂无法判断尺寸费用',detail:'请先修正尺寸或高级参数；不会据此显示免费。'};}
}
