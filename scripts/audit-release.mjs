import {readFile,writeFile,readdir}from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';import{unzipSync}from'fflate';import{stripImageMetadata}from'../server/image-privacy.mjs';
const release=path.resolve('release'),failures=[],reports=[];
const forbidden=[['developer profile path',/[A-Z]:[\\/]+Users[\\/]+[^\\/]+[\\/]+(?:AppData|Documents)/i]];
// Additional locally supplied signatures never enter the package or audit receipt.
let signatures=[];try{signatures=JSON.parse(await readFile('.local/private-signatures.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
function scan(name,bytes,report){
 const b=Buffer.from(bytes),utf8=b.toString('utf8'),utf16=b.toString('utf16le');
 for(const [label,pattern]of forbidden)if(pattern.test(utf8)||pattern.test(utf16))failures.push({file:name,reason:label});
 for(const value of signatures)if(value.length>=8&&(b.includes(Buffer.from(value))||b.includes(Buffer.from(value,'utf16le'))))failures.push({file:name,reason:'local private signature detected'});
 if(/\.(png|jpg|jpeg|webp)$/i.test(name)){try{if(!b.equals(stripImageMetadata(b)))failures.push({file:name,reason:'image text/EXIF or recognized pixel metadata'});report.images++;}catch(e){failures.push({file:name,reason:'image audit failed: '+e.message});}}
 if(/launcher\.ico$/i.test(name)){const count=b.readUInt16LE(4);for(let i=0;i<count;i++){const at=6+i*16,size=b.readUInt32LE(at+8),start=b.readUInt32LE(at+12),data=b.subarray(start,start+size);if(data[0]===137)scan(name+'#'+i+'.png',data,report);}}
 if(name.endsWith('curated/library.json')){const d=JSON.parse(utf8);if(d.entries.length!==8)failures.push({file:name,reason:'curated entry count changed'});for(const entry of d.entries){if((entry.notes&&entry.notes!=='Lucifer 精选 · 随分享版提供')||entry.kind==='draft')failures.push({file:name,reason:'private notes or draft in curated pack'});const cover=entry.cover?.match(/^data:image\/(png|jpeg|webp);base64,(.*)$/s);if(cover)scan(name+'#cover.'+cover[1],Buffer.from(cover[2],'base64'),report);}}
}
for(const file of (await readdir(release)).filter(x=>/\.(zip|apk)$/.test(x))){
 const bytes=await readFile(path.join(release,file)),files=unzipSync(bytes),report={file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,entries:Object.keys(files).length,images:0};
 for(const [raw,data]of Object.entries(files)){
  const name=raw.replace(/^\.\//,'');if(name.endsWith('/'))continue;
  if(name.startsWith('/')||name.split('/').includes('..'))failures.push({file:name,reason:'unsafe archive path'});
  if(/(?:^|\/)(?:userdata|\.local|\.git|logs|node_modules|screenshots)(?:\/|$)|(?:AGENTS|MEMORY)\.md$|(?:\.jks|\.keystore|\.map|\.log|\.env|local\.properties)$/i.test(name))failures.push({file:name,reason:'excluded release content'});
  if(file.endsWith('.zip')&&!/^(?:app\/(?:server\/index\.mjs|scripts\/(?:fx-mcp|fx)\.mjs|dist\/.*|public\/curated\/library\.json)|runtime\/(?:node\.exe|LICENSE)|启动 Lucifer FX\.exe|使用说明\.md|THIRD-PARTY-LICENSES\.txt|manifest\.json|fx\.cmd)$/.test(name))failures.push({file:name,reason:'not in Windows allowlist'});
  scan(file+'/'+name,data,report);
 }
 if(file.endsWith('.zip')){const manifest=JSON.parse(Buffer.from(files['manifest.json']).toString());for(const item of manifest.files){const data=files[item.path];if(!data||createHash('sha256').update(data).digest('hex')!==item.sha256)failures.push({file:item.path,reason:'manifest checksum mismatch'});}}
 reports.push(report);
}
if(!reports.some(x=>x.file.endsWith('.zip'))||!reports.some(x=>x.file.endsWith('.apk')))failures.push({reason:'Both release artifacts are required'});
const result={checkedAt:new Date().toISOString(),passed:failures.length===0,archives:reports,checks:['unpacked allowlist and excluded paths','compiled UTF-8/UTF-16 private strings','optional private signatures','PNG/JPEG/WebP metadata and recognized steganography','ICO embedded PNG images','curated covers and notes','Windows file manifest'],failures};
await writeFile('.local/release-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(failures.length)process.exitCode=1;
