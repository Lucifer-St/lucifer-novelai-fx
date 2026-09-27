export const IMPORT_OPTIONS_KEY='lucifer-image-import-options-v1';
export const DEFAULT_IMPORT_OPTIONS={prompt:true,negative:false,characters:false,settings:false,seed:false,append:false};
export function importOptions(value){
 const saved=value?.version===1?value.options:{};
 return Object.fromEntries(Object.entries(DEFAULT_IMPORT_OPTIONS).map(([key,fallback])=>[key,typeof saved?.[key]==='boolean'?saved[key]:fallback]));
}
export function loadImportOptions(){try{return importOptions(JSON.parse(localStorage.getItem(IMPORT_OPTIONS_KEY)||'null'));}catch{return {...DEFAULT_IMPORT_OPTIONS};}}
export function storeImportOptions(options){try{localStorage.setItem(IMPORT_OPTIONS_KEY,JSON.stringify({version:1,options:importOptions({version:1,options})}));}catch{}}
export function availableImportOptions(options,available){return {...options,...Object.fromEntries(Object.keys(DEFAULT_IMPORT_OPTIONS).filter(k=>k!=='append').map(k=>[k,!!options[k]&&!!available[k]]))};}
