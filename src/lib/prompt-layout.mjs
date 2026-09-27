export const PROMPT_LAYOUT_KEY='lucifer-prompt-layout-v1';
export function normalizePromptLayout(value){
 const source=value?.version===1?value:{};
 const entries=source.characters&&typeof source.characters==='object'&&!Array.isArray(source.characters)?Object.entries(source.characters):[];
 return {version:1,mode:source.mode==='merged'?'merged':'classic',mainCollapsed:source.mainCollapsed===true,characters:Object.fromEntries(entries.filter(([id,folded])=>id.length>0&&id.length<=256&&typeof folded==='boolean').slice(-256))};
}
export function readPromptLayout(storage){try{return normalizePromptLayout(JSON.parse(storage?.getItem(PROMPT_LAYOUT_KEY)||'null'));}catch{return normalizePromptLayout();}}
export function writePromptLayout(storage,value){storage.setItem(PROMPT_LAYOUT_KEY,JSON.stringify(normalizePromptLayout(value)));}
export function toggleCharacterFold(value,id){const current=normalizePromptLayout(value);return normalizePromptLayout({...current,characters:{...current.characters,[id]:!current.characters[id]}});}
