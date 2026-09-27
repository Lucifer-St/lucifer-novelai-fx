const modes=new Set(['generate','img2img','infill']);
// Retain the local source/mask so an accidental mode switch does not destroy
// the user's input. Only remove incompatible request overrides.
export function cleanModeOverrides(state,mode){
 const keys=mode==='generate'?['image','mask','img2img','strength','noise']:mode==='img2img'?['mask','img2img']:[];
 if(!keys.length)return state;
 const next={...state};
 if(state.overrides)next.overrides=Object.fromEntries(Object.entries(state.overrides).filter(([key])=>!keys.includes(key)));
 if(typeof state.extraJSON==='string')try{const extra=JSON.parse(state.extraJSON);if(extra&&typeof extra==='object'&&!Array.isArray(extra)&&keys.some(key=>Object.hasOwn(extra,key)))next.extraJSON=JSON.stringify(Object.fromEntries(Object.entries(extra).filter(([key])=>!keys.includes(key))),null,2);}catch{/* Keep invalid manual JSON for normal preflight validation. */}
 return next;
}
export function changeGenerationMode(state,mode){if(!modes.has(mode))throw Error('未知生成模式。');return {...cleanModeOverrides(state,mode),mode};}
export function restoreGenerationMode(state){
 if(!modes.has(state.mode))return changeGenerationMode(state,'generate');
 let extra;try{extra=JSON.parse(state.extraJSON||'{}');}catch{}
 // Autosaved preferences deliberately omit uploaded images. Reopening an empty
 // image workflow should return to txt2img, rather than restore an unusable pane.
 if(state.mode!=='generate'&&!state.source&&!state.overrides?.image&&!extra?.image)return changeGenerationMode(state,'generate');
 return state.mode==='generate'?cleanModeOverrides(state,'generate'):state;
}
export function cleanComparisonMode(config,mode){return {...config,overrides:Object.fromEntries(Object.entries(config.overrides||{}).map(([variant,values])=>[variant,cleanModeOverrides(values,mode)]))};}
