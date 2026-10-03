import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {stripImageMetadata} from '../server/image-privacy.mjs';
const receipt=JSON.parse(await readFile('.local/android-package.json','utf8'));
const bytes=await readFile(receipt.apk),sha256=createHash('sha256').update(bytes).digest('hex');
if(sha256!==receipt.sha256)throw Error('APK checksum differs from signing receipt');
const files=unzipSync(bytes),failures=[],counts={archive:0,source:0,images:0};
const signatures=process.env.FX_PRIVATE_SIGNATURES_FILE?JSON.parse(await readFile(process.env.FX_PRIVATE_SIGNATURES_FILE,'utf8')):[];
function inspect(name,data,archive=false){
 counts[archive?'archive':'source']++;
 for(const value of signatures)if(typeof value==='string'&&value.length>=8&&(data.includes(Buffer.from(value))||data.includes(Buffer.from(value,'utf16le'))))failures.push({file:name,reason:'private signature'});
 if(/(?:^|\/)(?:userdata|\.local|\.git|logs|node_modules)\/|(?:AGENTS|MEMORY)\.md$|\.(?:jks|keystore|pem|key|map|log)$|(?:^|\/)\.env/.test(name))failures.push({file:name,reason:'excluded path'});
 if(/\.(?:java|gradle|mjs|js|jsx|json|css|md|html|xml)$/.test(name)&&/[CG]:[\\/]+(?:Users[\\/]+[^\\/\s]+[\\/]+(?:\.codex|AppData|Documents)|AI[\\/]+novelai-)/i.test(data.toString('utf8')))failures.push({file:name,reason:'private development path'});
 if(archive&&name.startsWith('assets/public/')&&/\.(?:png|jpe?g|webp)$/i.test(name)){counts.images++;try{if(!data.equals(stripImageMetadata(data)))failures.push({file:name,reason:'image metadata'});}catch{failures.push({file:name,reason:'image inspection failed'});}}
}
for(const [name,data] of Object.entries(files))if(!name.endsWith('/'))inspect(name,Buffer.from(data),true);
const source=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const name of source)inspect(name,await readFile(name));
const result={version:receipt.version,sha256,counts,privateSignatures:signatures.length,passed:failures.length===0,failures};
await writeFile('.local/android-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
