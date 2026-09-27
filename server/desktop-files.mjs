import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FeatureError} from './local-store.mjs';
const exec=promisify(execFile),project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function validateLocalPath(value){
 if(typeof value!=='string'||!value.trim()||value.length>4096||/[\x00-\x1f"<>|]/.test(value)||!path.isAbsolute(value)||/^(?:https?|file):/i.test(value))throw new FeatureError('请选择有效的本机绝对路径。','invalid_directory',400);
 return path.resolve(value);
}
export function createDesktopFiles({cacheDir,helperPath=path.join(project,'dist/native/DesktopBridge.exe'),sourcePath=path.join(project,'server/DesktopBridge.cs'),execImpl=exec,runImpl,platform=process.platform}={}){
 let building=null,choosing=false;
 async function helper(){
  if(platform!=='win32')throw new FeatureError('此操作需要 Windows 桌面。','desktop_unavailable',409);
  try{if((await stat(helperPath)).isFile())return helperPath;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!building)building=(async()=>{
   const source=await readFile(sourcePath),hash=createHash('sha256').update(source).digest('hex').slice(0,16),target=path.join(cacheDir,'DesktopBridge-'+hash+'.exe');
   await mkdir(cacheDir,{recursive:true});try{if((await stat(target)).isFile())return target;}catch(e){if(e.code!=='ENOENT')throw e;}
   const compiler=path.join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
   await execImpl(compiler,['/nologo','/codepage:65001','/target:winexe','/optimize+','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/out:'+target,sourcePath],{windowsHide:true,timeout:30000});return target;
  })().catch(error=>{building=null;throw new FeatureError('无法启动本机目录窗口；请先手动填写路径。','desktop_unavailable',503);});
  return building;
 }
 async function run(action,target,signal){
  const executable=await helper(),input={action,path:target};
  if(runImpl)return runImpl(input);
  return new Promise((resolve,reject)=>{
   const child=execFile(executable,[],{windowsHide:false,timeout:action==='choose'?300000:15000,maxBuffer:32768,encoding:'utf8',signal},(error,stdout)=>{
    let result;try{result=JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{}
    if(result?.ok)return resolve(result);
    reject(new FeatureError(error?.killed?'目录窗口等待超时，请重新选择。':result?.message||'本机文件夹窗口未能打开，请检查目录权限后重试。','desktop_error',503));
   });
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
  });
 }
 return {
  async choose(initial,signal){if(choosing)throw new FeatureError('已有目录选择窗口，请先完成或取消。','directory_busy',409);const target=initial?validateLocalPath(initial):'';choosing=true;try{return await run('choose',target,signal);}finally{choosing=false;}},
  async open(value,signal){const target=validateLocalPath(value);await mkdir(target,{recursive:true});return run('open',target,signal);},
  async reveal(value,signal){const target=validateLocalPath(value);if(!(await stat(target)).isFile())throw new FeatureError('图片文件已不存在。','not_found',404);return run('reveal',target,signal);},
  helper,
 };
}
