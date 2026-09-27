import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export class FeatureError extends Error { constructor(message,code='invalid_request',status=400){super(message);this.code=code;this.status=status;} }
export function createLocalStore(directory){
  let tail=Promise.resolve();
  const root=path.resolve(directory);
  function target(name){if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))throw new FeatureError('无效记录名');return path.join(root,name);}
  async function read(name,fallback=null){try{return JSON.parse(await readFile(target(name),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw new FeatureError('本地记录无法读取，请保留文件并检查备份。','store_corrupt',500);}}
  async function write(name,value){await mkdir(root,{recursive:true});const file=target(name),temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await rename(temp,file);return value;}
  const serial=fn=>{const run=tail.catch(()=>{}).then(fn);tail=run;return run;};
  async function list(){try{const names=(await readdir(root)).filter(n=>/^[a-zA-Z0-9_-]+\.json$/.test(n));return (await Promise.all(names.map(n=>read(n)))).filter(Boolean);}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  return {read,write,list,serial};
}

const KINDS=new Set(['draft','preset','snippet','style','starter','character','negative','parameters','favorite']);
const DEFAULT_CATEGORIES=['画风','角色','场景','服装','其他'];
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
function sameContent(a,b){return JSON.stringify(stable(a))===JSON.stringify(stable(b));}
function backupId(id,data){const bytes=createHash('sha256').update(id+'\n'+JSON.stringify(stable(data))).digest();bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=bytes.subarray(0,16).toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
export function createLibrary(directory){
 const store=createLocalStore(directory);
 const settings=createLocalStore(path.join(directory,'settings'));
 const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
 function validate(input){
  if(!input||typeof input!=='object'||!KINDS.has(input.kind))throw new FeatureError('请选择有效的预设类型。');
  const title=String(input.title||'').trim();if(!title||title.length>120)throw new FeatureError('名称需要 1–120 个字符。');
  const sourceUrl=String(input.sourceUrl||'');if(sourceUrl&&!/^https?:\/\//i.test(sourceUrl))throw new FeatureError('来源链接需要 http(s) 地址。');
  const cover=String(input.cover||'');if(cover&&(!/^data:image\/(?:png|jpeg|webp);base64,/.test(cover)||cover.length>3*1024*1024))throw new FeatureError('示例图需要小于 2 MB 的 PNG/JPEG/WebP 缩略图。');
  return {kind:input.kind,title,category:String(input.category||'').slice(0,100),notes:String(input.notes||'').slice(0,8000),text:String(input.text||'').slice(0,150000),sourceUrl,cover,payload:input.payload??null};
 }
 function backupPlan(bundle,existing,mode){
  if(bundle?.format!=='lucifer-library'||bundle.version!==1||!Array.isArray(bundle.entries)||bundle.entries.length>1000)throw new FeatureError('无法识别的预设库文件。');
  if(!['merge','restore'].includes(mode))throw new FeatureError('请选择合并或恢复模式。');
  const categories=Array.isArray(bundle.categories)?bundle.categories:[];
  if(categories.length>100||categories.some(c=>typeof c!=='string'||!c.trim()||c.length>40))throw new FeatureError('分类格式无效。');
  const byId=new Map(existing.map(entry=>[entry.id,entry])),operations=[];
  let skipped=0,conflicts=0;
  for(const source of bundle.entries){
   if(!validId(source?.id))throw new FeatureError('备份条目缺少有效 ID；请重新导出工具备份。');
   const data=validate(source),current=byId.get(source.id);
   if(current&&sameContent(validate(current),data)){skipped++;continue;}
   // Exact content already present (for example a bundled curated card) is
   // safe to skip; titles alone are never treated as identity.
   if(existing.some(entry=>!entry.deletedAt&&sameContent(validate(entry),data))||operations.some(item=>sameContent(item.data,data))){skipped++;continue;}
   let id=source.id;
   if(current){
    if(mode==='restore'){conflicts++;continue;}
    id=backupId(source.id,data);
   }
   const mapped=byId.get(id);
   if(mapped){if(sameContent(validate(mapped),data))skipped++;else conflicts++;continue;}
   operations.push({id,data});byId.set(id,{id,...data});
  }
  return {operations,summary:{total:bundle.entries.length,added:operations.length,skipped,conflicts,categories:categories.length},categories};
 }
 return {
  async categories(){const custom=await settings.read('categories.json',{version:1,names:[]});const entries=await store.list();return [...new Set([...DEFAULT_CATEGORIES,...custom.names,...entries.map(e=>e.category).filter(Boolean)])];},
  addCategory(name){return settings.serial(async()=>{name=String(name||'').trim();if(!name||name.length>40)throw new FeatureError('分类名称需要 1–40 个字符。');const current=await settings.read('categories.json',{version:1,names:[]});if(!current.names.includes(name))current.names.push(name);await settings.write('categories.json',current);return this.categories();});},
  async list({query='',kind='',category='',today=false,includeDeleted=false}={}){const q=String(query).toLowerCase().trim(),day=new Date().toLocaleDateString('en-CA');return (await store.list()).filter(e=>(includeDeleted||!e.deletedAt)&&(!kind||e.kind===kind)&&(!category||(e.category||'其他')===category)&&(!today||new Date(e.createdAt).toLocaleDateString('en-CA')===day)&&(!q||[e.title,e.category,e.notes,e.text].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({payload,...entry})=>entry);},
  async get(id){if(!validId(id))throw new FeatureError('无效的预设 ID');const e=await store.read(`${id}.json`);if(!e)throw new FeatureError('记录不存在。','not_found',404);return e;},
  put(input){return store.serial(async()=>{const data=validate(input),id=input.id||randomUUID();if(!validId(id))throw new FeatureError('无效的预设 ID');const previous=await store.read(`${id}.json`);if(previous&&input.revision!==previous.revision)throw new FeatureError('此记录已在其他窗口更新，请重新打开。','revision_conflict',409);const now=new Date().toISOString();return store.write(`${id}.json`,{version:1,id,...data,createdAt:previous?.createdAt||now,updatedAt:now,revision:(previous?.revision||0)+1});});},
  archive(id,restore=false){return store.serial(async()=>{const e=await this.get(id);const now=new Date().toISOString();return store.write(`${id}.json`,{...e,deletedAt:restore?null:now,updatedAt:now,revision:e.revision+1});});},
  async export(){return {format:'lucifer-library',version:1,categories:await this.categories(),entries:(await store.list()).filter(e=>!e.deletedAt)};},
  async import(bundle){if(bundle?.format!=='lucifer-library'||bundle.version!==1||!Array.isArray(bundle.entries)||bundle.entries.length>1000)throw new FeatureError('无法识别的预设库文件。');const valid=bundle.entries.map(validate);const categories=Array.isArray(bundle.categories)?bundle.categories:[];if(categories.length>100||categories.some(c=>typeof c!=='string'||!c.trim()||c.length>40))throw new FeatureError('分类格式无效。');const imported=[];for(const e of valid)imported.push(await this.put(e));for(const category of categories)await this.addCategory(category);return imported;},
  async previewBackup(bundle,mode){return backupPlan(bundle,await store.list(),mode).summary;},
  async restoreBackup(bundle,mode){const summary=await store.serial(async()=>{const plan=backupPlan(bundle,await store.list(),mode);for(const {id,data} of plan.operations){const now=new Date().toISOString();await store.write(`${id}.json`,{version:1,id,...data,createdAt:now,updatedAt:now,revision:1});}return plan.summary;});for(const category of bundle.categories||[])await this.addCategory(category);return summary;},
 };
}
