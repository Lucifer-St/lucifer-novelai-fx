// Separate, bundled helper runs with a copied runtime so the installed Node can be replaced.
import path from 'node:path';
import {readFile,writeFile,mkdir,rename,lstat,unlink,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertNoLinks,safeUpdatePath,UPDATE_TOP_LEVEL,atomicJSON} from '../server/app-updater.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function exists(file){try{await lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function applyUpdate(plan,{waitForExit=async pid=>{for(let i=0;i<240;i++){try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}await delay(250);}throw Error('旧服务未退出，更新已停止。');},start=defaultStart,verify=defaultVerify,afterMove=async()=>{}}={}){
 const {root,transaction,dataDir,statePath}=plan;
 if(path.resolve(statePath)!==path.resolve(dataDir,'update-status.json')||!path.resolve(transaction).startsWith(path.resolve(dataDir,'updates')+path.sep)||!Number.isInteger(plan.pid)||plan.pid<1||!Number.isInteger(plan.port)||plan.port<1024||plan.port>65535)throw Error('无效更新计划。');
 await assertNoLinks(root);await assertNoLinks(transaction);
 await writeFile(path.join(transaction,'helper-active.json'),JSON.stringify({pid:process.pid}),{flag:'wx'});
 const stage=path.join(transaction,'new'),backup=path.join(transaction,'backup'),moved=[],installed=[];
 const record=async(status,error)=>atomicJSON(statePath,{status,currentVersion:status==='succeeded'?plan.targetVersion:plan.currentVersion,targetVersion:plan.targetVersion,updatedAt:new Date().toISOString(),backupAvailable:moved.length>0,...(error?{error}: {})});
 let child,oldExited=false,interrupted=false,restoredSafely=true;
 try{
  await waitForExit(plan.pid);
  oldExited=true;
  for(const name of UPDATE_TOP_LEVEL){await assertNoLinks(root,name);await assertNoLinks(stage,name);}
  const manifestBytes=await readFile(path.join(stage,'manifest.json'));if(digest(manifestBytes)!==plan.manifestSHA256)throw Error('更新清单校验失败。');
  const manifest=JSON.parse(manifestBytes);
  if(manifest.product!=='Lucifer NovelAI FX Share'||manifest.version!==plan.targetVersion)throw Error('更新目标版本不一致。');
  const expected=new Set(['manifest.json']);
  for(const entry of manifest.files){
   if(!safeUpdatePath(entry.path)||expected.has(entry.path))throw Error('更新文件路径无效。');expected.add(entry.path);
   await assertNoLinks(stage,entry.path);const bytes=await readFile(path.join(stage,entry.path));if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw Error('更新文件校验失败。');
  }
  async function inspect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('更新目录含链接。');if(entry.isDirectory())await inspect(full);else if(!expected.delete(path.relative(stage,full).replaceAll('\\','/')))throw Error('更新目录含未校验文件。');}}
  await inspect(stage);if(expected.size)throw Error('更新文件不完整。');
  await mkdir(backup,{recursive:true});
  const originals=[];for(const name of UPDATE_TOP_LEVEL)if(await exists(path.join(root,name)))originals.push(name);
  await atomicJSON(path.join(transaction,'journal.json'),{originals,phase:'applying'});
  for(const name of UPDATE_TOP_LEVEL){
   if(await exists(path.join(root,name))){await rename(path.join(root,name),path.join(backup,name));moved.push(name);await afterMove(name,'backup');}
   if(await exists(path.join(stage,name))){await rename(path.join(stage,name),path.join(root,name));installed.push(name);await afterMove(name,'install');}
  }
  child=await start(plan);await verify(plan,plan.targetVersion,child);await record('succeeded');
 }catch(error){
  if(error.simulatedPowerLoss){interrupted=true;throw error;}
  if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,10000).unref();});}
  if(!moved.length&&!installed.length){if(oldExited)try{const restored=await start(plan);await verify(plan,plan.currentVersion,restored);}catch{}await record('failed',error.message);return;}
  try{
   // Move failed new files aside; never delete either version or userdata.
   const failed=path.join(transaction,'failed');await mkdir(failed,{recursive:true});
   for(const name of [...installed].reverse())if(await exists(path.join(root,name)))await rename(path.join(root,name),path.join(failed,name));
   for(const name of [...moved].reverse())await rename(path.join(backup,name),path.join(root,name));
   const restored=await start(plan);await verify(plan,plan.currentVersion,restored);await record('rolled_back','新版启动失败，已恢复旧版。');
  }catch{restoredSafely=false;await record('failed','更新未能完成自动恢复。请重新打开启动器继续恢复，旧程序备份已保留。');}
 }finally{if(!interrupted){await unlink(path.join(transaction,'helper-active.json')).catch(()=>{});if(restoredSafely)await unlink(path.join(dataDir,'update.lock')).catch(()=>{});}}
}
export async function recoverUpdate(plan,{start=defaultStart,verify=defaultVerify,probe=async()=>{try{const r=await fetch(`http://127.0.0.1:${plan.port}/api/status`,{signal:AbortSignal.timeout(1000)});return await r.json();}catch{return null;}}}={}){
 const {root,transaction,dataDir,statePath}=plan;
 await assertNoLinks(root);await assertNoLinks(transaction);
 if(!path.resolve(transaction).startsWith(path.resolve(dataDir,'updates')+path.sep)||path.resolve(statePath)!==path.resolve(dataDir,'update-status.json'))throw Error('恢复路径无效。');
 try{
  const active=JSON.parse(await readFile(path.join(transaction,'helper-active.json'),'utf8'));
  if(!Number.isInteger(active.pid)||active.pid<1)throw Error('更新进程记录无效，请保留备份。');
  try{process.kill(active.pid,0);throw Error('更新程序仍在运行，请等待它结束后再恢复。');}catch(e){if(e.code!=='ESRCH')throw e;}
  await unlink(path.join(transaction,'helper-active.json'));
 }catch(e){if(e.code!=='ENOENT')throw e;}
 await writeFile(path.join(transaction,'helper-active.json'),JSON.stringify({pid:process.pid}),{flag:'wx'});
 try{return await recoverUnlocked(plan,{start,verify,probe});}finally{await unlink(path.join(transaction,'helper-active.json')).catch(()=>{});}
}
async function recoverUnlocked(plan,{start,verify,probe}){
 const {root,transaction,dataDir,statePath}=plan;
 const running=await probe();
 async function diskVersionIs(version){try{
  const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));if(manifest.version!==version||manifest.product!=='Lucifer NovelAI FX Share'||!Array.isArray(manifest.files))return false;
  for(const entry of manifest.files){if(!safeUpdatePath(entry.path))return false;await assertNoLinks(root,entry.path);const bytes=await readFile(path.join(root,entry.path));if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)return false;}return true;
 }catch{return false;}}
 if(running){
  if(running.shareEdition&&running.installId===plan.installId&&running.version===plan.targetVersion+'-share'&&await diskVersionIs(plan.targetVersion)){
   await atomicJSON(statePath,{status:'succeeded',currentVersion:plan.targetVersion,targetVersion:plan.targetVersion,backupAvailable:true,updatedAt:new Date().toISOString()});await unlink(path.join(dataDir,'update.lock')).catch(()=>{});return;
  }
  // A running old service means replacement never began. Never stop an unknown process.
  if(running.shareEdition&&running.installId===plan.installId&&running.version===plan.currentVersion+'-share'&&await diskVersionIs(plan.currentVersion)){
   await atomicJSON(statePath,{status:'rolled_back',currentVersion:plan.currentVersion,error:'原版本已完整恢复并正在运行。'});await unlink(path.join(dataDir,'update.lock')).catch(()=>{});return;
  }
  throw Error('本机端口已有其他服务，请先确认正在运行的安装。');
 }
 let journal;try{journal=JSON.parse(await readFile(path.join(transaction,'journal.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(journal){
  if(!Array.isArray(journal.originals)||journal.originals.some(name=>!UPDATE_TOP_LEVEL.includes(name)))throw Error('恢复记录无效。');
  const backup=path.join(transaction,'backup'),stage=path.join(transaction,'new'),failed=path.join(transaction,'interrupted-'+Date.now());await mkdir(failed,{recursive:true});
  for(const name of [...UPDATE_TOP_LEVEL].reverse()){
   await assertNoLinks(root,name);await assertNoLinks(backup,name);
   if(await exists(path.join(backup,name))){if(await exists(path.join(root,name)))await rename(path.join(root,name),path.join(failed,name));await rename(path.join(backup,name),path.join(root,name));}
   else if(!journal.originals.includes(name)&&!await exists(path.join(stage,name))&&await exists(path.join(root,name)))await rename(path.join(root,name),path.join(failed,name));
  }
 }
 const child=await start(plan);await verify(plan,plan.currentVersion,child);
 await atomicJSON(statePath,{status:'rolled_back',currentVersion:plan.currentVersion,targetVersion:plan.targetVersion,error:'上次更新意外中断，已恢复原版本。',updatedAt:new Date().toISOString()});await unlink(path.join(dataDir,'update.lock')).catch(()=>{});
}
async function defaultStart(plan){
 const child=spawn(path.join(plan.root,'runtime/node.exe'),[path.join(plan.root,'app/server/index.mjs'),'--port',String(plan.port)],{cwd:plan.root,detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,FX_SHARE_ROOT:plan.root,FX_SHARE_INSTALL_ID:plan.installId,NODE_OPTIONS:'',NODE_PATH:''}});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
 try{await writeFile(path.join(plan.dataDir,'launcher.pid'),String(child.pid));await writeFile(path.join(plan.dataDir,'launcher.port'),String(plan.port));}catch(error){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,10000).unref();});throw error;}child.unref();return child;
}
async function defaultVerify(plan,version,child){
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('新版服务提前退出。');
  try{const response=await fetch(`http://127.0.0.1:${plan.port}/api/status`,{signal:AbortSignal.timeout(1000)});const state=await response.json();if(state.shareEdition&&state.installId===plan.installId&&state.version===version+'-share')return;}catch{}
  await delay(300);
 }
 throw Error('更新后服务验证超时。');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const plan=JSON.parse(await readFile(process.argv[2],'utf8'));if(process.argv.includes('--recover'))await recoverUpdate(plan);else await applyUpdate(plan);
}
