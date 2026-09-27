import {cp,mkdir,readFile,readdir,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stripImageMetadata} from '../server/image-privacy.mjs';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version;
const destination=path.join(root,'release',`public-source-${version}-${new Date().toISOString().replace(/[:.]/g,'-')}`);
// Explicit application-source export. Never copy Git history or local records.
const directories=['src','server','public','tests','scripts','shared','assets/readme','.github'];
const files=['README.md','LICENSE','SECURITY.md','.gitignore','package.json','package-lock.json','index.html','vite.config.js','playwright.config.mjs','playwright.themes.config.mjs','capacitor.config.json','docs/WINDOWS.md','docs/WINDOWS-QUICKSTART.md','docs/ART-NOTICE.md','docs/EDITION-DIFFERENCES.md','docs/DEVELOPMENT.md','docs/AGENT_API.md','docs/SOURCE-LICENSE.md','docs/ANDROID-SOURCE.md'];
await mkdir(destination,{recursive:true});
for(const dir of directories)await cp(path.join(root,dir),path.join(destination,dir),{recursive:true,errorOnExist:true,force:false,filter:async source=>{if((await lstat(source)).isSymbolicLink())throw Error('Symlink in source');return true;}});
for(const file of files){await mkdir(path.dirname(path.join(destination,file)),{recursive:true});await cp(path.join(root,file),path.join(destination,file),{errorOnExist:true,force:false});}
// Frozen native source; omit generated web bundles, signing and machine configuration.
async function native(dir){for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){
 const rel=dir+'/'+item.name;if(item.isSymbolicLink())throw Error('Symlink in Android source');
 if(['build','.gradle','.idea'].includes(item.name)||['local.properties','google-services.json'].includes(item.name)||rel.startsWith('android/app/src/main/assets/public')||/\.(?:apk|jks|keystore|idsig|log)$/.test(rel))continue;
 if(item.isDirectory())await native(rel);else if(/\.(?:java|xml|gradle|properties|bat|jar|json|png)$/.test(rel)||['gradlew','.gitignore','.gitkeep','proguard-rules.pro'].includes(item.name)){
 await mkdir(path.dirname(path.join(destination,rel)),{recursive:true});
 if(rel.endsWith('.png'))await writeFile(path.join(destination,rel),stripImageMetadata(await readFile(path.join(root,rel))));
 else await cp(path.join(root,rel),path.join(destination,rel));
 }
}}
await native('android');
const manifest=[];
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink in export');if(item.isDirectory())await walk(full);else{const data=await readFile(full);manifest.push({path:path.relative(destination,full).replaceAll('\\','/'),bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}}}
await walk(destination);
await writeFile(path.join(destination,'PUBLIC-MANIFEST.json'),JSON.stringify({version,gitHistory:false,license:'MIT',artworkLicense:'See docs/SOURCE-LICENSE.md',entries:manifest},null,2)+'\n');
await mkdir('.local',{recursive:true});await writeFile('.local/public-source.json',JSON.stringify({destination,version,files:manifest.length},null,2));
console.log(JSON.stringify({destination,version,files:manifest.length}));
