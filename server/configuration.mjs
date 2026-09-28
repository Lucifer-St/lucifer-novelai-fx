import path from 'node:path';
import {mkdir,readFile,writeFile,rename,unlink,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {FeatureError} from './local-store.mjs';
const exec=promisify(execFile);
const powerShell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
export const OFFICIAL='https://image.novelai.net';
export function normalizeProfile(value={}){
 const provider=value.provider??'official';if(!['official','native','openai'].includes(provider))throw new FeatureError('请选择有效的接口类型。');
 let baseURL=provider==='official'?OFFICIAL:String(value.baseURL||'').trim().replace(/\/+$/,'');
 if(baseURL){let u;try{u=new URL(baseURL);}catch{throw new FeatureError('API 地址无效。');}
  if(u.username||u.password||u.search||u.hash||!['https:','http:'].includes(u.protocol)||(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw new FeatureError('API 地址须为 HTTPS；仅本机地址允许 HTTP，不可包含密钥或查询参数。');
  baseURL=u.href.replace(/\/+$/,'');
 }
 return {provider,baseURL};
}
export function mapProviderRequest(profile,route,body,method='POST'){
 const config=normalizeProfile(profile);if(!config.baseURL)throw new FeatureError('请先设置 API 地址。','not_configured',409);
 let wire=body,targetRoute=route;
 if(route==='/v1/images/generations'&&config.provider!=='openai'){
  targetRoute=body?.novelai?.endpoint;wire=body?.novelai?.body;
  if(!['/ai/generate-image','/ai/generate-image-stream','/ai/upscale','/ai/augment-image','/ai/encode-vibe'].includes(targetRoute)||!wire)throw new FeatureError('需要完整的 NovelAI 原生图片请求。');
 }
 if(!['/v1/images/generations','/v1/models','/user/subscription','/ai/generate-image','/ai/generate-image-stream','/ai/upscale','/ai/augment-image','/ai/encode-vibe'].includes(targetRoute))throw new FeatureError('分享版未开放此上游操作。');
 const base=config.provider==='openai'?config.baseURL.replace(/\/v1$/,''):config.baseURL;
 return {url:new URL(targetRoute.replace(/^\//,''),base+'/'),body:wire,method};
}
export function createWindowsVault(){
 async function protect(value,decode=false){
  if(process.platform!=='win32')throw new FeatureError('此桌面凭据存储需要 Windows；测试需注入隔离 vault。','vault_unavailable',503);
  const action=decode?'Unprotect':'Protect',script=`Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v.Trim()); $r=[Security.Cryptography.ProtectedData]::${action}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  return new Promise((resolve,reject)=>{const child=execFile(powerShell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,maxBuffer:32768},(error,stdout)=>error?reject(new FeatureError('系统凭据保护不可用。','vault_error',503)):resolve(Buffer.from(stdout.trim(),'base64')));child.stdin.end(Buffer.from(value).toString('base64'));});
 }
 return {seal:async value=>(await protect(Buffer.from(value))).toString('base64'),open:async value=>(await protect(Buffer.from(value,'base64'),true)).toString('utf8')};
}
export function createConfiguration({directory,root,vault=createWindowsVault()}){
 let chain=Promise.resolve();
 const defaults=()=>({version:1,...normalizeProfile(),outputDirectory:path.join(root,'userdata','output'),saveDirectory:path.join(root,'userdata','saved'),storageRoots:[],autoSaveOutput:true,beginner:true,tutorialComplete:false});
 async function raw(){try{const d={...defaults(),...JSON.parse(await readFile(path.join(directory,'settings.json'),'utf8'))};if(d.outputDirectory==='@app/output')d.outputDirectory=defaults().outputDirectory;if(d.saveDirectory==='@app/saved')d.saveDirectory=defaults().saveDirectory;return d;}catch(e){if(e.code!=='ENOENT')throw e;return defaults();}}
 async function save(config){await mkdir(directory,{recursive:true});const stored={...config};if(stored.outputDirectory===defaults().outputDirectory)stored.outputDirectory='@app/output';if(stored.saveDirectory===defaults().saveDirectory)stored.saveDirectory='@app/saved';const tmp=path.join(directory,'settings.'+randomUUID()+'.tmp');await writeFile(tmp,JSON.stringify(stored,null,2));await rename(tmp,path.join(directory,'settings.json'));}
 const publicConfig=d=>{const {secret,...safe}=d;return {...safe,keyConfigured:!!secret,platform:'windows',defaultPaths:{output:path.join(root,'userdata','output'),saved:path.join(root,'userdata','saved')}};};
 return {
  get:async()=>publicConfig(await raw()),
  async key(){const d=await raw();if(!d.secret)throw new FeatureError('请在设置中填写自己的 API Token / Key。','not_configured',409);return vault.open(d.secret);},
  update(body){const run=chain.then(async()=>{const old=await raw(),profile=normalizeProfile({...old,...body}),next={...old,...profile};
   if(body.clearKey)delete next.secret;
   if(typeof body.key==='string'&&body.key.trim()){const key=body.key.trim();if(!profile.baseURL)throw new FeatureError('请填写 API 地址。');if(key.length>8192||/[\r\n]/.test(key))throw new FeatureError('密钥格式无效。');next.secret=await vault.seal(key);}
   // Credentials are never silently reused for a different destination.
   if((profile.provider!==old.provider||profile.baseURL!==old.baseURL)&&!body.key?.trim())delete next.secret;
   if(body.autoSaveOutput!==undefined){if(typeof body.autoSaveOutput!=='boolean')throw new FeatureError('自动保存设置必须为开关值。');next.autoSaveOutput=body.autoSaveOutput;}
   for(const key of ['outputDirectory','saveDirectory'])if(body[key]!==undefined){const value=String(body[key]).trim();if(!path.isAbsolute(value))throw new FeatureError('请选择绝对文件夹路径。');const folder=path.resolve(value);await mkdir(folder,{recursive:true});await access(folder,constants.W_OK);const probe=path.join(folder,'.fx-write-'+randomUUID());await writeFile(probe,'');await unlink(probe);next.storageRoots=[...new Set([...next.storageRoots,old[key],folder])];next[key]=folder;}
   for(const key of ['beginner','tutorialComplete'])if(typeof body[key]==='boolean')next[key]=body[key];await save(next);return publicConfig(next);
  });chain=run.catch(()=>{});return run;},
  async export(){const d=await raw();return {...normalizeProfile(d),beginner:d.beginner};},
 };
}
