import path from 'node:path';
import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export async function startResidentHost({root,port,installId,execPath=process.execPath,platform=process.platform,disabled=process.env.FX_DISABLE_RESIDENT==='1',spawnImpl=spawn}){
 if(disabled||platform!=='win32'||!installId||path.resolve(execPath).toLowerCase()!==path.resolve(root,'runtime/node.exe').toLowerCase())return false;
 const bytes=await readFile(path.join(root,'app/dist/native/ResidentHost.exe'));
 const hash=createHash('sha256').update(bytes).digest('hex');
 const directory=path.join(root,'userdata/desktop-host'),target=path.join(directory,hash+'.exe');
 await mkdir(directory,{recursive:true});
 const temporary=path.join(directory,randomUUID()+'.tmp');
 try{await writeFile(temporary,bytes,{flag:'wx'});try{await rename(temporary,target);}catch(error){if(!['EEXIST','EPERM','EACCES'].includes(error.code))throw error;}}finally{await unlink(temporary).catch(()=>{});}
 if(createHash('sha256').update(await readFile(target)).digest('hex')!==hash)throw Error('Resident host cache mismatch');
 const child=spawnImpl(target,[root,String(port),installId,'share'],{cwd:directory,windowsHide:false,detached:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return true;
}
