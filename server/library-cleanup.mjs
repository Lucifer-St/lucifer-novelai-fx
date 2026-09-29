import {mkdir,readFile,readdir,rename,stat,lstat,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createLocalStore,FeatureError} from './local-store.mjs';

const fail=message=>new FeatureError(message,'library_cleanup',409);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validKey=key=>/^\d+-[a-f0-9]{8}:\d{1,2}$/.test(key);
const retentionMs=7*86400000;
export function createLibraryCleanup({dataDir,historyStore,index,paths,lease}){
 const store=createLocalStore(path.join(dataDir,'library-cleanup')),previews=new Map(),pending=new Set();let busy=false,closed=false,lastError='';
 async function config(){return await store.read('settings.json')||{version:1,maxImages:0};}
 async function settings(value){if(value===undefined)return {...await config(),lastError,retentionDays:7};if(!Number.isInteger(value.maxImages)||value.maxImages<0||value.maxImages>1000000)throw fail('图库上限须为 0–1000000 的整数；0 表示关闭自动清理。');await store.write('settings.json',{version:1,maxImages:value.maxImages});return settings();}
 async function checkedFile(file,roots){
  const full=path.resolve(file);if(!roots.map(r=>path.resolve(r)).includes(path.dirname(full)))throw fail('图片位置已变化或不在应用保存目录中，未执行清理。');
  let info;try{info=await lstat(full);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!info.isFile()||info.isSymbolicLink())throw fail('不能清理链接或非普通图片文件。');
  const parent=await realpath(path.dirname(full));if(path.dirname(await realpath(full))!==parent)throw fail('图片路径检查失败。');
  return {source:full,bytes:info.size,mtime:info.mtimeMs,sha256:createHash('sha256').update(await readFile(full)).digest('hex')};
 }
 async function build(keys){
  if(!Array.isArray(keys)||keys.length>10000||keys.some(k=>typeof k!=='string'||!validKey(k)))throw fail('请选择有效图片；单次最多清理 10000 张。');
  const cfg=await paths(),roots=[cfg.resultDir,cfg.outputDir,...cfg.storageRoots],annotations=(await index.exportAnnotations()).items,entries=new Map(),removed=[],protectedKeys=[],files=new Map();
  for(const key of [...new Set(keys)]){
   const [id,position]=key.split(':'),i=Number(position);let entry=entries.get(id);if(!entry){entry=await historyStore.read(id+'.json');if(entry)entries.set(id,entry);}
   const image=entry?.images?.[i];if(!image||image.deletedAt)continue;
   if(annotations[key]?.favorite||image.savedToLibrary||image.savedPath||image.savedName){protectedKeys.push(key);continue;}
   const candidates=[],internalName=image.name===`${id}-${i+1}${path.extname(image.name||'')}`&&/\.(png|jpg|webp|gif)$/.test(image.name);
   if(internalName)candidates.push(path.join(cfg.resultDir,image.name));
   const ownedOutput=new RegExp(`^(?:V5Full|V45Full|V45Curated)-[\\dT_-]+-seed(?:\\d+|unknown)-${id.split('-')[1]}-${i+1}(?:-\\d+)?\\.(png|jpg|webp|gif)$`);
   if(image.outputName&&path.basename(image.outputName)===image.outputName&&(ownedOutput.test(image.outputName)||(internalName&&image.outputName===image.name))){
    if(image.outputPath&&path.basename(image.outputPath)===image.outputName&&roots.map(r=>path.resolve(r)).includes(path.dirname(path.resolve(image.outputPath))))candidates.push(image.outputPath);
    candidates.push(path.join(cfg.outputDir,image.outputName));
   }
   for(const candidate of new Set(candidates)){const file=await checkedFile(candidate,roots);if(file)files.set(file.source,file);}
   removed.push(key);
  }
  // Never move a file also referenced by an unselected/protected image.
  for(const entry of await historyStore.list())for(const [i,image] of (entry.images||[]).entries()){if(!image||image.deletedAt||removed.includes(entry.id+':'+i))continue;
   for(const source of [image.outputPath,image.savedPath,image.name?path.join(cfg.resultDir,image.name):null,image.outputName?path.join(cfg.outputDir,image.outputName):null].filter(Boolean))files.delete(path.resolve(source));
  }
  const selectedEntries=[];
  for(const [id,entry] of entries){const selected=removed.filter(key=>key.startsWith(id+':')).map(key=>Number(key.split(':')[1]));if(!selected.length)continue;
   selectedEntries.push({id,entry,selected});
   // A response may embed all images. Keep it while another image in this result survives.
   if(entry.images.every((image,i)=>!image||image.deletedAt||selected.includes(i))){
    const names=await readdir(cfg.resultDir);
    for(const name of names.filter(n=>(n.startsWith(id+'-')&&/-(?:response\.json|request\.json)$/.test(n))||[id+'.sse',id+'.txt',id+'.bin'].includes(n))){const file=await checkedFile(path.join(cfg.resultDir,name),[cfg.resultDir]);if(file)files.set(file.source,file);}
   }
  }
  const values=[...files.values()].sort((a,b)=>a.source.localeCompare(b.source));
  const plan={keys:removed,protected:protectedKeys,files:values,entries:selectedEntries};plan.signature=hash(plan);return plan;
 }
 const view=plan=>({count:plan.keys.length,protectedCount:plan.protected.length,bytes:plan.files.reduce((n,f)=>n+f.bytes,0),files:plan.files.length});
 async function preview(keys){const plan=await build(keys),token=randomUUID();previews.set(token,{keys,signature:plan.signature,until:Date.now()+600000});while(previews.size>20)previews.delete(previews.keys().next().value);return {token,...view(plan)};}
 async function move(plan){
  if(!plan.keys.length)return {...view(plan),id:null};
  const id=randomUUID(),record={version:1,kind:'library-trash',id,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+retentionMs).toISOString(),status:'moving',...plan};
  record.files=record.files.map(f=>({...f,target:path.join(path.dirname(f.source),'.lucifer-fx-trash',id,path.basename(f.source))}));
  await store.write(id+'.json',record);
  try{
   for(const file of record.files){await mkdir(path.dirname(file.target),{recursive:true});const expected=path.join(await realpath(path.dirname(file.source)),'.lucifer-fx-trash',id);if(await realpath(path.dirname(file.target))!==expected)throw fail('回收目录含有链接，未移动文件。');await rename(file.source,file.target);}
   for(const item of record.entries){const next=structuredClone(item.entry);for(const i of item.selected)next.images[i]={...next.images[i],deletedAt:record.createdAt};await historyStore.write(item.id+'.json',next);await index.indexEntry(next);}
   record.status='trashed';await store.write(id+'.json',record);return {id,...view(plan)};
  }catch(error){lastError='清理未完成，文件留在本机回收站，可点击恢复。';record.status='interrupted';await store.write(id+'.json',record).catch(()=>{});throw error;}
 }
 async function exclusive(fn,automatic=false){if(closed)return;const operation=lease(async()=>{if(busy)throw fail('图库正在整理，请稍后再试。');busy=true;try{return await fn();}finally{busy=false;}},automatic);pending.add(operation);try{return await operation;}finally{pending.delete(operation);}}
 async function execute(token){return exclusive(async()=>{const p=previews.get(token);if(!p||p.until<Date.now())throw fail('清理预览已过期，请重新预览。');const plan=await build(p.keys);if(plan.signature!==p.signature)throw fail('图片、收藏或保存状态已改变，请重新预览。');previews.delete(token);return move(plan);});}
 async function records(){return (await store.list()).filter(r=>r.kind==='library-trash'&&!['restored','purged'].includes(r.status));}
 async function trash(){const entries=await records();return {entries:entries.map(r=>({id:r.id,createdAt:r.createdAt,expiresAt:r.expiresAt,status:r.status,count:r.keys.length,bytes:r.files.reduce((n,f)=>n+f.bytes,0)}))};}
 async function validateTrashFile(record,file){
  if(!/^[a-f0-9-]{36}$/.test(record.id)||file.target!==path.join(path.dirname(file.source),'.lucifer-fx-trash',record.id,path.basename(file.source)))throw fail('回收记录路径无效。');
  const cfg=await paths(),roots=[cfg.resultDir,cfg.outputDir,...cfg.storageRoots].map(p=>path.resolve(p));if(!roots.includes(path.dirname(file.source)))throw fail('原保存目录已变化，请先恢复目录设置。');
  let info;try{info=await lstat(file.target);}catch(e){if(e.code==='ENOENT')return false;throw e;}
  if(!info.isFile()||info.isSymbolicLink()||info.size!==file.bytes)throw fail('回收文件已变化，未继续操作。');
  const expected=path.join(await realpath(path.dirname(file.source)),'.lucifer-fx-trash',record.id);if(path.dirname(await realpath(file.target))!==expected)throw fail('回收目录含有链接，未继续操作。');
  if(createHash('sha256').update(await readFile(file.target)).digest('hex')!==file.sha256)throw fail('回收文件内容已改变，未继续操作。');return true;
 }
 async function restore(id){return exclusive(async()=>{const record=(await records()).find(r=>r.id===id);if(!record)throw fail('未找到可恢复的清理记录。');
  for(const file of record.files){if(!await validateTrashFile(record,file)){let bytes;try{bytes=await readFile(file.source);}catch{throw fail('回收文件与原文件均缺失，无法完整恢复。');}if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw fail('原文件已改变，未覆盖。');continue;}try{await stat(file.source);throw fail('原位置已有文件，恢复已停止，未覆盖。');}catch(e){if(e.code!=='ENOENT')throw e;}}
  for(const file of record.files)if(await validateTrashFile(record,file))await rename(file.target,file.source);
  for(const item of record.entries){const current=await historyStore.read(item.id+'.json')||item.entry;for(const i of item.selected){if(current.images[i]?.deletedAt===record.createdAt)current.images[i]=item.entry.images[i];}await historyStore.write(item.id+'.json',current);await index.indexEntry(current);}
  record.status='restored';await store.write(id+'.json',record);return {restored:record.keys.length};
 });}
 async function purgeRecords(expiredOnly){let count=0;for(const record of await records()){
  if(record.status!=='trashed'||expiredOnly&&Date.parse(record.expiresAt)>Date.now())continue;
  const present=[];for(const file of record.files)if(await validateTrashFile(record,file))present.push(file);
  for(const file of present)await unlink(file.target);
  record.status='purged';await store.write(record.id+'.json',record);count+=record.keys.length;
 }return {purged:count};}
 async function automatic(){try{const configNow=await config();if(!configNow.maxImages&&!(await records()).some(r=>r.status==='trashed'&&Date.parse(r.expiresAt)<=Date.now()))return;return await exclusive(async()=>{const cfg=await config();await purgeRecords(true);if(!cfg.maxImages)return;await index.start();const all=await index.selection({}),excess=all.length-cfg.maxImages;if(excess<=0)return;const eligible=[];
  for(const row of [...all].reverse()){if(row.favorite)continue;const entry=await historyStore.read(row.result_id+'.json'),image=entry?.images?.[row.image_index];if(!image||image.deletedAt||image.savedToLibrary||image.savedPath||image.savedName)continue;eligible.push(row.key);if(eligible.length>=Math.min(excess,10000))break;}
  const result=await move(await build(eligible));lastError=result.count<excess?'受保护图片或本轮清理数量限制使图库暂时超过上限。':'';return result;
 },true);}catch(e){if(e.code!=='generation_busy')lastError=e.message;}}
 return {get busy(){return busy;},settings,preview,execute,trash,restore,purge:()=>exclusive(()=>purgeRecords(false)),automatic,async close(){closed=true;await Promise.allSettled([...pending]);}};
}
