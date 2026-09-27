import {readFile,readdir,writeFile,mkdir,stat} from 'node:fs/promises';import path from 'node:path';
import {stripImageMetadata} from '../server/image-privacy.mjs';
import {exportPreset,defaults} from '../src/lib/request.mjs';
const source=process.argv[2];if(!source)throw Error('Pass the explicitly approved library directory');
const forbidden=/[A-Z]:[\\/]|(?:Bearer\s+[a-z0-9_-]{15})/i;
const entries=[];
for(const file of await readdir(source)){if(!/^[a-f0-9-]+\.json$/.test(file))continue;const e=JSON.parse(await readFile(path.join(source,file),'utf8'));if(e.deletedAt||e.kind==='draft')continue;
 const selected={kind:e.kind,title:e.title,category:e.category||'Lucifer 精选',text:e.text||'',notes:'Lucifer 精选 · 随分享版提供',sourceUrl:e.sourceUrl&&/^https:\/\/(?:danbooru\.donmai\.us|www\.pixiv\.net|pixiv\.net)\//.test(e.sourceUrl)?e.sourceUrl:'',cover:'',payload:null};
 if(e.payload?.state){const state={...defaults(),...e.payload.state,source:'',mask:'',promptCards:[],negativeCards:[],nativeBodyExtras:{}};selected.payload={state:exportPreset(state).state};}
 else if(['preset','parameters','character'].includes(e.kind)&&e.payload)selected.payload=structuredClone(e.payload);
 if(e.cover){const m=e.cover.match(/^data:image\/(png|jpeg|webp);base64,(.*)$/s);if(m)selected.cover=`data:image/${m[1]};base64,${stripImageMetadata(Buffer.from(m[2],'base64')).toString('base64')}`;}
 if(forbidden.test(JSON.stringify({...selected,cover:''})))throw Error('Manual curation needed for one entry; sensitive contents not printed');
 entries.push(selected);
}
await mkdir('public/curated',{recursive:true});await writeFile('public/curated/library.json',JSON.stringify({format:'lucifer-library',version:1,categories:['Lucifer 精选'],entries},null,2));
let cleaned=0;async function clean(dir){for(const e of await readdir(dir,{withFileTypes:true})){const target=path.join(dir,e.name);if(e.isDirectory())await clean(target);else if(/\.(png|jpe?g|webp)$/i.test(e.name)){const old=await readFile(target);await writeFile(target,stripImageMetadata(old));cleaned++;}}}await clean('public/assets');
console.log(JSON.stringify({curatedEntries:entries.length,artFilesStrippedOfTextMetadata:cleaned,sourceModified:false}));
