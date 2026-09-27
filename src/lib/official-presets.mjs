// Official text presets, checked 2026-09-25. These are prompt text, not new API fields.
// https://docs.novelai.net/en/image/qualitytags/
// https://docs.novelai.net/en/image/undesiredcontent/
const heavy='lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const furry='{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';
const negative={
 'nai-diffusion-5-full':{
  heavy,
  light:'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
  human:heavy+', @_@, mismatched pupils, glowing eyes, bad anatomy',furry,
 },
 'nai-diffusion-4-5-full':{
  heavy,
  light:'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
  human:heavy+', @_@, mismatched pupils, glowing eyes, bad anatomy',furry,
 },
 'nai-diffusion-4-5-curated':{
  heavy:'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
  light:'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
  human:'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
 },
};
const quality={
 'nai-diffusion-5-full':{standard:', very aesthetic, masterpiece, no text',light:', very aesthetic, amazing quality, no text'},
 'nai-diffusion-4-5-full':{standard:', location, very aesthetic, masterpiece, no text'},
 'nai-diffusion-4-5-curated':{standard:', location, masterpiece, no text, -0.8::feet::, rating:general'},
};
const id=model=>model.replace(/-inpainting$/,'');
// Official public client 787d312-production, module 15512 (2026-09-25).
// The wire hint enum differs from legacy ucPreset array indexes.
export const officialPresetHint=preset=>({none:0,standard:1,heavy:2,light:3,human:4,furry:5})[preset];
export const qualityPresets=model=>Object.keys(quality[id(model)]||{});
export const qualitySuffix=(model,preset='standard')=>quality[id(model)]?.[preset]??quality[id(model)]?.standard??'';
export const negativePresets=model=>negative[id(model)]||{};

// Longest prefix first: Human contains all of Heavy in Full models.
// Partial/edited preset text is custom text and must never be removed.
export function splitNegativePreset(text='',model){
 if(typeof text!=='string')return {preset:'none',custom:text};
 const match=Object.entries(negativePresets(model)).sort((a,b)=>b[1].length-a[1].length).find(([,preset])=>text===preset||text.startsWith(preset+', ')||text.startsWith(preset+'\n'));
 if(!match)return {preset:'none',custom:text};
 const remainder=text.slice(match[1].length);
 return {preset:match[0],custom:remainder.startsWith(', ')?remainder.slice(2):remainder.startsWith('\n')?remainder.slice(1):remainder};
}
export function applyNegativePreset(text,model,preset){
 const custom=splitNegativePreset(text,model).custom,prefix=negativePresets(model)[preset]||'';
 return [prefix,custom].filter(Boolean).join(', ');
}
export function changeNegativeModel(text,previous,next){
 const {preset,custom}=splitNegativePreset(text,previous);
 if(preset==='none'||!negativePresets(next)[preset])return text;
 return [negativePresets(next)[preset],custom].filter(Boolean).join(', ');
}
export function splitQualityPrompt(prompt='',model){
 const match=/(?:^|\n)\s*Text\s*:/i.exec(prompt),split=match?match.index:prompt.length;
 const base=prompt.slice(0,split),tail=prompt.slice(split);
 for(const preset of qualityPresets(model)){
  const suffix=match?qualitySuffix(model,preset).replace(/,\s*no text\b/gi,''):qualitySuffix(model,preset);
  if(base.endsWith(suffix))return {preset,prompt:base.slice(0,-suffix.length)+tail};
 }
 return {preset:null,prompt};
}
