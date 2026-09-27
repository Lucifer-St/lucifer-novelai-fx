import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {stripImageMetadata} from '../server/image-privacy.mjs';
import {CURATED_SEED_IDS} from '../server/library.mjs';
const root=process.cwd(),failures=[],checks={sourceFiles:0,archiveFiles:0,images:0,embeddedCovers:0};
const packageReceipt=JSON.parse(await readFile('.local/windows-package.json','utf8'));
const distributionOnly=process.argv.includes('--distribution');
const sourceReceipt=JSON.parse(await readFile(distributionOnly?'.local/public-distribution.json':'.local/public-source.json','utf8'));
const expectedVersion=JSON.parse(await readFile('package.json','utf8')).version;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let privateSignatures=[];try{privateSignatures=JSON.parse(await readFile('.local/private-signatures.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const excluded=/(?:^|\/)(?:userdata|\.local|\.git|logs|node_modules|design-explorations|screenshots)(?:\/|$)|(?:AGENTS|MEMORY)\.md$|(?:\.jks|\.keystore|\.map|\.log|\.env|local\.properties)$/i;
const runtimeAllowed=/^(?:app\/(?:server\/index\.mjs|scripts\/(?:fx-mcp|fx|apply-update)\.mjs|dist\/.*|public\/curated\/library\.json)|runtime\/(?:node\.exe|LICENSE)|启动 Lucifer FX\.exe|恢复更新\.cmd|使用说明\.md|THIRD-PARTY-LICENSES\.txt|manifest\.json|fx\.cmd|docs\/(?:PUBLIC-RIGHTS|RELEASE-CHECKLIST|ART-NOTICE)\.md)$/;
function fail(file,reason){failures.push({file,reason});}
function inspect(file,bytes){
 const b=Buffer.from(bytes);
 for(const signature of privateSignatures)if(typeof signature==='string'&&signature.length>=8&&(b.includes(Buffer.from(signature))||b.includes(Buffer.from(signature,'utf16le'))))fail(file,'private signature');
 if(/\.(?:mjs|js|jsx|json|css|md|txt|html|cs|cmd|ps1|yml)$/.test(file)){
  const text=b.toString('utf8');
  if(/[CG]:[\\/]+(?:Users[\\/]+[^\\/\s]+[\\/]+(?:\.codex|AppData|Documents)|AI[\\/]+novelai-)/i.test(text))fail(file,'private development path');
 }
 if(/\.(?:png|jpe?g|webp)$/i.test(file)){checks.images++;try{if(!b.equals(stripImageMetadata(b)))fail(file,'image metadata or recognized steganography');}catch{fail(file,'image metadata inspection failed');}}
 if(file.endsWith('curated/library.json')){
  const data=JSON.parse(b);const titles=['Claire','Noire','Rena'];
  if(data.entries.length!==3||data.entries.some(e=>e.kind!=='snippet'||!titles.includes(e.title)||e.id!==CURATED_SEED_IDS[e.title])||new Set(data.entries.map(e=>e.id)).size!==3)fail(file,'curated allowlist differs');
  for(const e of data.entries){const cover=e.cover?.match(/^data:image\/(png|jpeg|webp);base64,(.*)$/s);if(cover){checks.embeddedCovers++;inspect(file+'#'+e.title+'.'+cover[1],Buffer.from(cover[2],'base64'));}}
 }
}
const source=path.resolve(sourceReceipt.destination),sourceManifest=distributionOnly?sourceReceipt.manifest:JSON.parse(await readFile(path.join(source,'PUBLIC-MANIFEST.json'),'utf8'));
const sourceEntries=new Map(sourceManifest.entries.map(e=>[e.path,e]));
async function scanSource(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name),rel=path.relative(source,full).replaceAll('\\','/');if(distributionOnly&&dir===source&&['.git','AGENTS.md','MEMORY.md'].includes(entry.name))continue;if(entry.isSymbolicLink()){fail(rel,'symlink in source');continue;}if(excluded.test(rel))fail(rel,'excluded source path');if(entry.isDirectory()){await scanSource(full);continue;}const b=await readFile(full);if(rel!=='PUBLIC-MANIFEST.json'){const expected=sourceEntries.get(rel);if(!expected||expected.sha256!==hash(b))fail(rel,'source manifest mismatch');sourceEntries.delete(rel);}checks.sourceFiles++;inspect('source/'+rel,b);}}
await scanSource(source);for(const file of sourceEntries.keys())fail(file,'missing source file');
if(sourceManifest.gitHistory!==false||sourceManifest.version!==expectedVersion)fail('PUBLIC-MANIFEST.json','version or history boundary');
const archive=await readFile(packageReceipt.zip),files=unzipSync(archive),manifest=JSON.parse(Buffer.from(files['manifest.json']));
if(hash(archive)!==packageReceipt.sha256||manifest.version!==expectedVersion)fail('Windows ZIP','receipt or version mismatch');
for(const [file,data] of Object.entries(files)){
 if(file.endsWith('/'))continue;checks.archiveFiles++;
 if(file.startsWith('/')||file.split('/').includes('..')||excluded.test(file)||!runtimeAllowed.test(file))fail(file,'not in runtime allowlist');
 inspect('zip/'+file,data);
}
const expectedFiles=new Set(['manifest.json',...manifest.files.map(e=>e.path)]);
for(const entry of manifest.files){const data=files[entry.path];if(!data||data.length!==entry.bytes||hash(data)!==entry.sha256)fail(entry.path,'archive manifest checksum');}
for(const file of Object.keys(files))if(!file.endsWith('/')&&!expectedFiles.has(file))fail(file,'unmanifested archive entry');
const result={at:new Date().toISOString(),passed:failures.length===0,version:expectedVersion,source,zip:packageReceipt.zip,sha256:hash(archive),checks,privateSignatureCount:privateSignatures.length,failures};
await writeFile('.local/public-candidate-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,failures},null,2));if(failures.length)process.exitCode=1;
