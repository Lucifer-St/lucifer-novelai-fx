import {createLocalStore,FeatureError} from './local-store.mjs';
const MAX_VALUE=2*1024*1024,MAX_TOTAL=8*1024*1024;
function validKey(key){return typeof key==='string'&&key.length>0&&key.length<=256&&!['__proto__','prototype','constructor'].includes(key);}
function validate(items){
 if(!items||typeof items!=='object'||Array.isArray(items)||Object.keys(items).length>256)throw new FeatureError('图鉴设置格式无效。');
 for(const [key,value]of Object.entries(items))if(!validKey(key)||typeof value!=='string'||Buffer.byteLength(value)>MAX_VALUE)throw new FeatureError('图鉴设置项无效或过大。');
 if(Buffer.byteLength(JSON.stringify(items))>MAX_TOTAL)throw new FeatureError('图鉴设置超过 8 MiB，请先导出并整理图鉴收藏。');return items;
}
export function createAtlasStorage(directory){
 const store=createLocalStore(directory);
 const read=async()=>validate((await store.read('browser-storage.json',{version:1,items:{}})).items);
 return {read,update:operation=>store.serial(async()=>{
  if(!operation||typeof operation!=='object')throw new FeatureError('图鉴设置操作无效。');
  let items=Object.assign(Object.create(null),await read());
  if(operation.action==='replace')items=Object.assign(Object.create(null),validate(operation.items));
  else if(operation.action==='clear')items=Object.create(null);
  else if(['set','remove'].includes(operation.action)&&validKey(operation.key)){
   if(operation.action==='set')items[operation.key]=operation.value;else delete items[operation.key];
  }else throw new FeatureError('图鉴设置操作无效。');
  validate(items);await store.write('browser-storage.json',{version:1,items});return {saved:true};
 })};
}
