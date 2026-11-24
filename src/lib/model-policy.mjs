import schema from '../../shared/schema.json' with {type:'json'};
import {changeNegativeModel,negativePresets,officialPresetHint,qualityPresets} from './official-presets.mjs';

export const DEFAULT_MODEL='nai-diffusion-5-full';
export const CURATED_V5='nai-diffusion-5-curated';
export const MEDIUM_V5='nai-diffusion-5-full-medium';
export const MEDIUM_V5_INPAINT=MEDIUM_V5+'-inpainting';
export const MODEL_IDS=[DEFAULT_MODEL,'nai-diffusion-4-5-full','nai-diffusion-4-5-curated',CURATED_V5];
export const SUPPORTED_MODELS=MODEL_IDS.map(id=>schema.models.find(model=>model.id===id));
export function modelSpec(id=DEFAULT_MODEL){
 const spec=SUPPORTED_MODELS.find(model=>model.id===id)
   ||SUPPORTED_MODELS.find(model=>model.id!==CURATED_V5&&model.inpaintingModel===id)
   ||(isMediumWireModel(id)?SUPPORTED_MODELS[0]:undefined);
 if(!spec)throw Error('不支持的图像模型；请选择 V5 或 V4.5 的 Full / Curated。');
 return spec;
}
export function isMediumWireModel(id){return id===MEDIUM_V5||id===MEDIUM_V5_INPAINT;}
export const isMediumEffort=state=>state.model===DEFAULT_MODEL&&state.effort==='medium';
export const MEDIUM_STEPS=14;
export const MEDIUM_SAMPLER='k_euler_ancestral';
export const MEDIUM_UC=negativePresets(DEFAULT_MODEL).heavy;
export const MEDIUM_LOCKED_PARAMETERS=new Set(['steps','sampler','noise_schedule','cfg_rescale','negative_prompt','ucPreset','tag_hint_uc_preset','v4_negative_prompt']);
export function requestModel(state){
 const spec=modelSpec(state.model);
 if(isMediumEffort(state))return state.mode==='infill'?MEDIUM_V5_INPAINT:MEDIUM_V5;
 return state.mode==='infill'?spec.inpaintingModel:spec.id;
}
const characterGrid=[.1,.3,.5,.7,.9];
export function snapCharacterCoordinate(value){
 return Number.isFinite(value)?characterGrid[Math.min(4,Math.max(0,Math.floor(value*5)))]:value;
}
export const isV45=id=>modelSpec(id).id.startsWith('nai-diffusion-4-5-');
export const isReferenceParameter=key=>/^(?:reference_|director_reference_|normalize_reference_strength)/.test(key)||key==='characterRef';
export function parameterSupported(model,key){
 return isV45(model)?!['tag_hint_transparent_background','tag_hint_qt','tag_hint_uc_preset'].includes(key):!isReferenceParameter(key)&&key!=='skip_cfg_above_sigma';
}
const draftKeys=['vibes','precise','referenceMode','noise_schedule','overrides','extraJSON','autoText','imageText','qualityPreset','effort'];
export function switchModel(state,id){
 const next=modelSpec(id),previous=modelSpec(state.model);
 if(next.id===previous.id)return state;
 const drafts={...state.modelDrafts,[previous.id]:Object.fromEntries(draftKeys.map(key=>[key,state[key]]))};
 const saved=drafts[next.id]||{};
 return {...state,model:next.id,nativeModel:next.inpaintingModel,
  vibes:[],precise:[],referenceMode:'off',noise_schedule:next.defaultParameters.noise_schedule,
  overrides:{},extraJSON:'{}',autoText:false,imageText:'',effort:'high',...saved,
  qualityPreset:qualityPresets(next.id).includes(saved.qualityPreset||state.qualityPreset)?(saved.qualityPreset||state.qualityPreset):'standard',
  negative:changeNegativeModel(state.negative,previous.id,next.id),
  modelDrafts:drafts};
}
export function validateModelPayload(payload){
 if(!payload?.novelai||!['/ai/generate-image','/ai/generate-image-stream'].includes(payload.novelai.endpoint||'/ai/generate-image'))return payload;
 const body=payload.novelai.body||{model:payload.model,action:payload.novelai.action||'generate',parameters:payload.novelai.parameters||{}};
 const nativeModel=body.model||payload.model,action=body.action||'generate';
 const spec=modelSpec(nativeModel),p=body.parameters||{};
 if(!['generate','img2img','infill'].includes(action))throw Error('生成模式无效。');
 const medium=isMediumWireModel(nativeModel);
 if(!MODEL_IDS.includes(payload.model)||nativeModel!==requestModel({model:payload.model,mode:action,effort:medium?'medium':'high'}))
  throw Error('外层模型、Effort 或生成模式与实际请求模型不匹配。');
 if(medium&&(p.steps!==MEDIUM_STEPS||p.sampler!==MEDIUM_SAMPLER||(p.cfg_rescale??0)!==0
    ||p.negative_prompt!==MEDIUM_UC||p.v4_negative_prompt?.caption?.base_caption!==MEDIUM_UC
    ||(p.v4_negative_prompt?.caption?.char_captions||[]).some(c=>c.char_caption!=='')
    ||(p.ucPreset??0)!==0||p.tag_hint_uc_preset!==officialPresetHint('heavy')))
  throw Error('V5 Full Medium 固定 14 步、Euler Ancestral 和 Heavy 负面预设，且不支持自写负面词或 PGR。');
 for(const key of Object.keys(p))if(!parameterSupported(spec.id,key))throw Error(`${spec.name} 不支持参数 ${key}；参考图功能仅用于 V4.5。`);
 const precise=p.director_reference_images||[],vibes=p.reference_image_multiple||[];
 if(precise.length&&(vibes.length||p.reference_image))throw Error('Precise Reference 与 Vibe Transfer 不能同时使用。');
 for(const [images,keys] of [[precise,['director_reference_descriptions','director_reference_information_extracted','director_reference_strength_values','director_reference_secondary_strength_values']],[vibes,['reference_strength_multiple']]]){
  if(!Array.isArray(images))throw Error('参考图必须是数组。');
  if(images.length>16)throw Error('最多使用 16 张参考图。');
  for(const key of keys)if(images.length&&(!Array.isArray(p[key])||p[key].length!==images.length))throw Error(`参考图与 ${key} 数量不一致。`);
 }
 for(const key of ['v4_prompt','v4_negative_prompt']){
  const chars=p[key]?.caption?.char_captions||[];
  if(chars.length>spec.webCapabilities.maxCharacters)throw Error(`${spec.name} 最多支持 ${spec.webCapabilities.maxCharacters} 个角色；原稿保留，请先调整。`);
  if(!spec.v5&&p[key]?.use_coords)for(const char of chars)for(const center of char.centers||[])for(const axis of ['x','y']){
   const value=center[axis],grid=(value-.1)/.2;
   if(!Number.isFinite(value)||value<.1-1e-8||value>.9+1e-8||Math.abs(grid-Math.round(grid))>1e-7)throw Error('V4.5 使用 5×5 角色位置网格，请在角色栏目重新选择位置；原稿未修改。');
  }
 }
 return payload;
}
