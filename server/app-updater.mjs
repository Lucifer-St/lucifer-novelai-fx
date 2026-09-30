import path from 'node:path';
import {readFile,writeFile,mkdir,lstat,copyFile,rename,unlink,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {unzipSync} from 'fflate';
import {compareVersions} from './release-services.mjs';

const MAX_ARCHIVE=256*1024*1024,MAX_EXPANDED=512*1024*1024;
const ALLOWED=/^(?:app\/(?:server\/index\.mjs|scripts\/(?:fx-mcp|fx|apply-update)\.mjs|dist\/.+|public\/curated\/library\.json)|runtime\/(?:node\.exe|LICENSE)|启动 Lucifer FX\.exe|恢复更新\.cmd|使用说明\.md|THIRD-PARTY-LICENSES\.txt|manifest\.json|fx\.cmd|docs\/(?:ART-NOTICE|PUBLIC-RIGHTS|RELEASE-CHECKLIST)\.md)$/;
export const UPDATE_TOP_LEVEL=['app','runtime','启动 Lucifer FX.exe','使用说明.md','THIRD-PARTY-LICENSES.txt','fx.cmd','docs','manifest.json'];
function abortable(promise,signal){
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export function assertUpdateStorage(root,directories=[]){
 for(const directory of directories.filter(Boolean))for(const name of UPDATE_TOP_LEVEL){
  const target=path.resolve(root,name).toLowerCase(),storage=path.resolve(directory).toLowerCase();
  if(target===storage||target.startsWith(storage+path.sep)||storage.startsWith(target+path.sep))fail('图片保存目录与程序更新目录重叠。请先在设置中迁移图片目录，确认旧图片仍可读取后再更新。');
 }
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function atomicJSON(file,value){const temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}}
function fail(message){throw Object.assign(Error(message),{status:409,code:'update_unavailable'});}
export function safeUpdatePath(name){
 return typeof name==='string'&&name.length<500&&!/[\\:\x00-\x1f]/.test(name)&&name.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[. ]$/.test(part)&&! /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))&&ALLOWED.test(name);
}
export function validateUpdateArchive(bytes,{version,sha256}){
 if(bytes.length>MAX_ARCHIVE||!/^\w{64}$/.test(sha256)||digest(bytes)!==sha256.toLowerCase())fail('安装包 SHA-256 校验失败，未修改当前程序。');
 let expanded=0,count=0;const zipNames=new Set();
 const files=unzipSync(bytes,{filter:file=>{
  if(file.name.endsWith('/'))return false;
  const normalized=file.name.toLowerCase();if(zipNames.has(normalized))fail('安装包有重复文件名。');zipNames.add(normalized);
  expanded+=file.originalSize;count++;
  if(!safeUpdatePath(file.name)||expanded>MAX_EXPANDED||count>4000)fail('安装包包含不允许的路径或超过大小上限。');
  return true;
 }});
 const names=Object.keys(files),seen=new Set();
 for(const name of names){if(seen.has(name.toLowerCase()))fail('安装包有重复文件名。');seen.add(name.toLowerCase());}
 let manifest;try{manifest=JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));}catch{fail('安装包缺少有效清单。');}
 if(manifest.product!=='Lucifer NovelAI FX Share'||manifest.version!==version||!Array.isArray(manifest.files)||manifest.files.length!==names.length-1)fail('安装包版本或文件清单不匹配。');
 const listed=new Set();
 for(const entry of manifest.files){
  if(!safeUpdatePath(entry.path)||entry.path==='manifest.json'||listed.has(entry.path))fail('安装清单包含无效路径。');
  listed.add(entry.path);const content=files[entry.path];
  if(!content||content.length!==entry.bytes||digest(content)!==entry.sha256)fail('安装包文件校验失败。');
 }
 for(const required of ['app/server/index.mjs','app/dist/index.html','runtime/node.exe','启动 Lucifer FX.exe','app/scripts/apply-update.mjs'])if(!listed.has(required))fail('安装包不支持完整应用内更新。');
 return {files,manifest};
}
// Follow only GitHub's public release-asset redirect; never send credentials.
export async function downloadReleaseAsset(url,{fetchImpl=fetch,signal,onProgress,expectedBytes,stallTimeoutMs=30000,totalTimeoutMs=600000}={}){
 const controller=new AbortController();let stall,total,reader;
 const abort=()=>controller.abort(signal.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const reset=()=>{clearTimeout(stall);stall=setTimeout(()=>controller.abort(Object.assign(Error('更新下载连续 30 秒没有进展，已停止；可以手动重试。'),{code:'update_stalled'})),stallTimeoutMs);stall.unref?.();};
 total=setTimeout(()=>controller.abort(Object.assign(Error('更新下载超过总时限，已停止；可以手动重试。'),{code:'update_timeout'})),totalTimeoutMs);total.unref?.();reset();
 try{
 let current=new URL(url);
 if(current.protocol!=='https:'||current.hostname!=='github.com'||current.port||current.username||current.password||current.hash||current.search)fail('更新下载地址无效。');
 for(let hop=0;hop<4;hop++){
  const response=await abortable(fetchImpl(current.href,{redirect:'manual',signal:controller.signal,credentials:'omit',headers:{Accept:'application/octet-stream','User-Agent':'Lucifer-NovelAI-FX-Updater'}}),controller.signal);reset();
  if([301,302,303,307,308].includes(response.status)){
   const next=new URL(response.headers.get('location'),current);await response.body?.cancel();
   if(next.protocol!=='https:'||next.port||next.username||next.password||!['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))fail('更新下载重定向不在 GitHub 发行域名内。');
   current=next;continue;
  }
  if(!response.ok)fail(`安装包下载失败（HTTP ${response.status}），当前版本未改变。`);
  if(Number(response.headers.get('content-length'))>MAX_ARCHIVE)fail('更新包超过大小上限。');
  const parts=[];let size=0;reader=response.body.getReader();
  for(;;){const {done,value:chunk}=await abortable(reader.read(),controller.signal);if(done)break;reset();size+=chunk.length;if(size>MAX_ARCHIVE)fail('更新包超过大小上限。');parts.push(Buffer.from(chunk));onProgress?.(size);}
  reader.releaseLock();reader=null;controller.signal.throwIfAborted();
  if(expectedBytes&&size!==expectedBytes)fail('安装包下载不完整，当前版本未改变。');
  return Buffer.concat(parts);
 }
 fail('更新下载重定向次数过多。');
 }finally{clearTimeout(stall);clearTimeout(total);signal?.removeEventListener('abort',abort);if(reader){void reader.cancel().catch(()=>{});}}
}
export async function assertNoLinks(root,relative=''){
 const resolved=path.resolve(root,relative),base=path.resolve(root);
 if(resolved!==base&&!resolved.startsWith(base+path.sep))fail('更新路径超出安装目录。');
 for(let current=resolved;;current=path.dirname(current)){
  try{if((await lstat(current)).isSymbolicLink())fail('安装路径含目录链接，无法安全原位更新。');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current===path.dirname(current))break;
 }
 return resolved;
}
export function createAppUpdater({root,dataDir,currentVersion,installId,releaseServices,fetchImpl=fetch,platform=process.platform,execPath=process.execPath,spawnImpl=spawn,downloadStallTimeoutMs=30000}={}){
 let state={status:'idle'},transaction=null,preparing=null,persistTail=Promise.resolve();
 const statePath=path.join(dataDir,'update-status.json');
 const portable=platform==='win32'&&Boolean(installId)&&path.resolve(execPath).toLowerCase()===path.resolve(root,'runtime/node.exe').toLowerCase();
 function persist(next){state={...state,...next,updatedAt:new Date().toISOString()};const snapshot={...state};persistTail=persistTail.catch(()=>{}).then(async()=>{await mkdir(dataDir,{recursive:true});await atomicJSON(statePath,snapshot);});return persistTail;}
 async function info(){
  if(!preparing&&(state.status==='idle'||state.status==='installing'&&!transaction))try{const saved=JSON.parse(await readFile(statePath,'utf8'));if(!preparing&&(state.status==='idle'||state.status==='installing'&&!transaction)){if(['succeeded','rolled_back','failed','cancelled','installing'].includes(saved.status))state=saved;else if(['checking','downloading','verifying','cancelling','prepared'].includes(saved.status))state={status:'failed',error:'上次更新准备未完成或服务已重启，可以重新下载；当前程序未改变。'};}}catch{}
  return {...state,status:preparing&&state.status==='prepared'?'verifying':state.status,canCancel:!!preparing&&!preparing.controller.signal.aborted,supported:portable,currentVersion};
 }
 async function cleanAttempt(folder){if(!folder)return;const full=path.resolve(folder),updates=path.resolve(dataDir,'updates');if(path.dirname(full)!==updates||!/^[-a-f0-9]{36}$/.test(path.basename(full)))fail('暂存清理路径无效。');await assertNoLinks(dataDir,path.relative(dataDir,full));await rm(full,{recursive:true,force:true});}
 async function prepare(){
  await info();
  if(!portable)fail('应用内安装仅适用于完整解压的 Windows 分享版；开发目录不会被覆盖。');
  if(state.status==='installing')fail('安装进行中，不能重新下载。');
  if(preparing||state.status==='prepared')return info();
  state={status:'checking'};
  const attempt={controller:new AbortController(),folder:null,promise:null};preparing=attempt;const signal=attempt.controller.signal;
  attempt.promise=Promise.resolve().then(async()=>{
   try{
    await persist({status:'checking'});signal.throwIfAborted();
    await assertNoLinks(root);await assertNoLinks(dataDir);
    const release=await abortable(releaseServices.checkUpdates(),signal);signal.throwIfAborted();
    if(release.status!=='update_available'||!release.download?.sha256)fail('尚无带 SHA-256 校验的更新包，请先检查更新。');
    if(compareVersions(release.latestVersion,currentVersion)<=0)fail('不会安装相同或更旧的版本。');
    const expectedName=`Lucifer-NovelAI-FX-Share-${release.latestVersion}-Windows-x64.zip`;
    if(release.download.name!==expectedName)fail('更新包名称与目标版本不匹配。');
    transaction=path.join(dataDir,'updates',randomUUID());attempt.folder=transaction;await mkdir(transaction,{recursive:true});signal.throwIfAborted();
    await persist({status:'downloading',targetVersion:release.latestVersion,downloaded:0,total:release.download.bytes,error:null});
    const bytes=await downloadReleaseAsset(release.download.url,{fetchImpl,signal,stallTimeoutMs:downloadStallTimeoutMs,expectedBytes:release.download.bytes,onProgress:size=>{if(!signal.aborted)state.downloaded=size;}});signal.throwIfAborted();
    await persist({status:'verifying'});
    signal.throwIfAborted();
    const {files}=validateUpdateArchive(bytes,{version:release.latestVersion,sha256:release.download.sha256});
    const stage=path.join(transaction,'new');await mkdir(stage,{recursive:true});
    for(const [name,content] of Object.entries(files)){signal.throwIfAborted();const file=path.join(stage,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,content,{flag:'wx'});}
    await copyFile(execPath,path.join(transaction,'runner.exe'));
    await copyFile(path.join(root,'app/scripts/apply-update.mjs'),path.join(transaction,'apply-update.mjs'));
    await copyFile(path.join(root,'启动 Lucifer FX.exe'),path.join(transaction,'UpdateHost.exe'));
    signal.throwIfAborted();await persist({status:'prepared',sha256:release.download.sha256,manifestSHA256:digest(files['manifest.json'])});signal.throwIfAborted();
   }catch(e){transaction=null;let cleanupPending=false;await cleanAttempt(attempt.folder).catch(()=>{cleanupPending=true;});await persist({status:signal.aborted?'cancelled':'failed',downloaded:0,cleanupPending,error:signal.aborted?(cleanupPending?'已取消下载；暂存文件未能全部清理，当前程序未改变。':null):e.code==='ENOSPC'?'磁盘空间不足，未安装更新。':e.message}).catch(()=>{});}
   finally{if(preparing===attempt)preparing=null;}
  });
  return info();
 }
 async function cancel(){
  await info();
  if(state.status==='installing')fail('安装已开始，不能取消；请等待完成或恢复。');
  const attempt=preparing;if(!attempt)return info();
  const save=persist({status:'cancelling',error:null});attempt.controller.abort(new DOMException('已取消更新下载','AbortError'));
  await Promise.allSettled([save,attempt.promise]);return info();
 }
 async function install({port,pid=process.pid}){
  if(!portable||preparing||state.status!=='prepared'||!transaction)fail('请先下载并校验更新包。');
  const plan={root:path.resolve(root),transaction,dataDir:path.resolve(dataDir),statePath,pid,port,installId,currentVersion,targetVersion:state.targetVersion,manifestSHA256:state.manifestSHA256,hostToken:randomUUID()};
  await assertNoLinks(root);for(const name of UPDATE_TOP_LEVEL)await assertNoLinks(root,name);
  const planPath=path.join(transaction,'plan.json');await writeFile(planPath,JSON.stringify(plan));
  await writeFile(path.join(dataDir,'update.lock'),JSON.stringify({transaction,at:new Date().toISOString()}),{flag:'wx'});
  let child;
  try{
   await persist({status:'installing'});
   child=spawnImpl(path.join(transaction,'UpdateHost.exe'),['--apply-update',path.resolve(root),planPath],{cwd:transaction,detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
   let ready=false;
   for(let i=0;i<350;i++){
    try{ready=(await readFile(path.join(transaction,'host-ready'),'utf8'))===plan.hostToken;}catch{}
    if(ready)break;if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));
   }
   if(!ready)fail('更新程序未取得启动锁，当前程序未替换。');
   await writeFile(path.join(transaction,'host-go'),plan.hostToken);
   child.unref();
  }catch(e){child?.kill();await unlink(path.join(dataDir,'update.lock')).catch(()=>{});await persist({status:'prepared',error:'无法启动更新程序，请重试。'}).catch(()=>{});throw e;}
  return info();
 }
 return {info,prepare,cancel,install,get active(){return Boolean(preparing)||state.status==='installing';}};
}
