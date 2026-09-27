import {DatabaseSync} from 'node:sqlite';
import {mkdir, readFile, readdir, rename, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {nativeRecipe} from './png-metadata.mjs';

const HISTORY_NAME = /^(\d+-[a-f0-9]{8})\.json$/;
const KEY = /^(\d+-[a-f0-9]{8}):(\d{1,2})$/;
const MAX_TAGS = 24;
const sleep = () => new Promise(resolve => setImmediate(resolve));
const string = (value, max = 8192) => typeof value === 'string' ? value.slice(0, max) : '';
const imageKey = (id, index) => `${id}:${index}`;
const safeDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d/.test(value) && Number.isFinite(Date.parse(value)) ? value : '';
const seedFromName = name => {const match=/-seed(\d+|unknown)-[a-f0-9]{8}-\d+(?:-\d+)?\.(?:png|jpe?g|webp|gif)$/i.exec(name||'');return match && match[1]!=='unknown'?match[1]:null;};
const annotationsFile = dataDir => path.join(dataDir,'generated-library','annotations.json');

function openDatabase(file) {
 const db=new DatabaseSync(file);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;');
 db.exec(`CREATE TABLE IF NOT EXISTS images (
  key TEXT PRIMARY KEY, result_id TEXT NOT NULL, image_index INTEGER NOT NULL,
  created_at TEXT NOT NULL, model TEXT NOT NULL, mode TEXT NOT NULL, seed TEXT,
  prompt TEXT NOT NULL, final_prompt TEXT NOT NULL, filename TEXT NOT NULL,
  url TEXT NOT NULL, request_url TEXT NOT NULL, metadata_json TEXT NOT NULL,
  has_file INTEGER NOT NULL, source_mtime REAL NOT NULL
 );
 CREATE INDEX IF NOT EXISTS images_order ON images(created_at DESC,key DESC);
 CREATE INDEX IF NOT EXISTS images_seed ON images(seed);
 CREATE INDEX IF NOT EXISTS images_model_mode ON images(model,mode);`);
 db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS image_text USING fts5(key UNINDEXED, text, tokenize='trigram');");
 return db;
}

function normalizeTags(input){
 if(!Array.isArray(input)||input.length>MAX_TAGS)throw Error('手工标签最多 24 个。');
 const values=input.map(value=>String(value).trim()).filter(Boolean);
 if(values.some(value=>value.length>40))throw Error('单个标签不能超过 40 字。');
 return [...new Set(values)];
}

function publicRow(row,annotation){
 return {...row,hasFile:!!row.has_file,has_file:undefined,source_mtime:undefined,
  metadata:JSON.parse(row.metadata_json||'{}'),metadata_json:undefined,
  favorite:!!annotation?.favorite,tags:annotation?.tags||[]};
}

export function createHistoryIndex({dataDir,historyDir=path.join(dataDir,'history'),resolveImage}={}){
 if(!dataDir)throw Error('dataDir is required');
 const directory=path.join(dataDir,'generated-library'),dbFile=path.join(directory,'index.sqlite');
 let db,initPromise=null,annotations={},scanPromise=null,paused=false,stopped=false,closing=false,activeWrites=0,scanned=0,total=0,broken=0,missing=0,duplicates=0,lastError='',annotationTail=Promise.resolve();
 async function initialize(){
  if(closing)throw Error('图库索引正在关闭');
  if(db)return;
  await mkdir(directory,{recursive:true});
  try{annotations=JSON.parse(await readFile(annotationsFile(dataDir),'utf8'));if(!annotations||typeof annotations!=='object'||Array.isArray(annotations))throw Error('invalid annotations');}
  catch(error){if(error.code!=='ENOENT')throw new Error('图库收藏和标签文件无法读取；原件已保留，请先修复或恢复备份。',{cause:error});annotations={};}
  try{db=openDatabase(dbFile);db.prepare('SELECT count(*) AS n FROM images').get();}
  catch(error){try{db?.close();}catch{}db=null;const damaged=`${dbFile}.corrupt-${Date.now()}`;for(const suffix of ['','-wal','-shm'])try{await rename(dbFile+suffix,damaged+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}db=openDatabase(dbFile);lastError=`旧查询索引损坏，已留存为 ${path.basename(damaged)} 并重新建立；收藏与标签未改动。`;
  }
 }
 function init(){if(db)return Promise.resolve();if(!initPromise)initPromise=initialize().finally(()=>{initPromise=null;});return initPromise;}
 async function saveAnnotations(){
  const file=annotationsFile(dataDir),temp=`${file}.${randomUUID()}.tmp`;
  await writeFile(temp,JSON.stringify({version:1,items:annotations.items||{}},null,2),{flag:'wx'});
  await rename(temp,file);
 }
 async function readRecipe(entry){
  const name=path.basename(String(entry.requestUrl||''));
  if(!new RegExp(`^${entry.id}-request\\.json$`).test(name))return {};
  try{const bytes=await readFile(path.join(dataDir,'results',name),'utf8');return nativeRecipe(JSON.parse(bytes));}catch{return {};}
 }
 async function present(entry,index,recipe){
  const image=entry.images[index],name=string(image?.name,256),output=string(image?.outputName,256);
  const requestedSeed=recipe?.parameters?.seed;
  const actualSeed=seedFromName(output)||seedFromName(image?.savedName)||(index===0&&Number.isInteger(requestedSeed)&&requestedSeed>=0&&requestedSeed<=4294967295?String(requestedSeed):null);
  let found=true;
  try{
   if(resolveImage)found=!!(await resolveImage(image));
   else{const candidates=[image?.outputPath,image?.savedPath,path.join(dataDir,'results',name)].filter(Boolean);found=false;for(const candidate of candidates){try{if((await stat(candidate)).isFile()){found=true;break;}}catch{}}
   }
  }catch{found=false;}
  const metadata={parameters:recipe?.parameters&&typeof recipe.parameters==='object'?recipe.parameters:{},negative_prompt:string(recipe?.parameters?.negative_prompt||recipe?.negative_prompt),action:string(recipe?.action||entry.action,64)};
  if(actualSeed!==null)metadata.parameters={...metadata.parameters,seed:Number(actualSeed)};else delete metadata.parameters.seed;
  return {key:imageKey(entry.id,index),result_id:entry.id,image_index:index,created_at:safeDate(entry.createdAt)||new Date(Number(entry.id.split('-')[0])||0).toISOString(),
   model:string(recipe?.model||entry.model,128),mode:string(recipe?.action||entry.action||entry.endpoint,128),seed:actualSeed,
   prompt:string(entry.prompt),final_prompt:string(recipe?.input||entry.finalPrompt||entry.prompt),filename:output||name,url:/^\/api\/results\/[\w%.-]+$/.test(image?.url||'')?image.url:'',
   request_url:/^\/api\/results\/[\w%.-]+$/.test(entry.requestUrl||'')?entry.requestUrl:'',metadata_json:JSON.stringify(metadata),has_file:found?1:0,source_mtime:0};
 }
 async function indexEntryRaw(entry,{mtime=Date.now()}={}){
  await init();
  if(!entry||!HISTORY_NAME.test(`${entry.id}.json`)||!Array.isArray(entry.images))throw Error('历史记录无效');
  const recipe=await readRecipe(entry),rows=[];
  for(let i=0;i<entry.images.length;i++)if(entry.images[i]&&typeof entry.images[i]==='object')rows.push({...await present(entry,i,recipe),source_mtime:mtime});
  db.exec('BEGIN IMMEDIATE');
  try{
   const old=db.prepare('SELECT key FROM images WHERE result_id=?').all(entry.id).map(row=>row.key);
   const keep=new Set(rows.map(row=>row.key));
   const put=db.prepare(`INSERT INTO images(key,result_id,image_index,created_at,model,mode,seed,prompt,final_prompt,filename,url,request_url,metadata_json,has_file,source_mtime)
    VALUES(@key,@result_id,@image_index,@created_at,@model,@mode,@seed,@prompt,@final_prompt,@filename,@url,@request_url,@metadata_json,@has_file,@source_mtime)
    ON CONFLICT(key) DO UPDATE SET created_at=excluded.created_at,model=excluded.model,mode=excluded.mode,seed=excluded.seed,prompt=excluded.prompt,final_prompt=excluded.final_prompt,filename=excluded.filename,url=excluded.url,request_url=excluded.request_url,metadata_json=excluded.metadata_json,has_file=excluded.has_file,source_mtime=excluded.source_mtime`);
   const delText=db.prepare('DELETE FROM image_text WHERE key=?'),addText=db.prepare('INSERT INTO image_text(key,text) VALUES(?,?)');
   for(const key of old)if(!keep.has(key)){db.prepare('DELETE FROM images WHERE key=?').run(key);delText.run(key);}
   for(const row of rows){put.run(row);delText.run(row.key);addText.run(row.key,[row.prompt,row.final_prompt,row.filename,(annotations.items?.[row.key]?.tags||[]).join(' ')].join(' '));}
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return rows.length;
 }
 async function indexEntry(entry,options){activeWrites++;try{return await indexEntryRaw(entry,options);}finally{activeWrites--;}}
 async function scan(){
  await init();scanned=0;broken=0;missing=0;
  let files;try{files=(await readdir(historyDir)).filter(name=>HISTORY_NAME.test(name)).sort();}catch(error){if(error.code==='ENOENT')files=[];else throw error;}
  total=files.length;
  for(const name of files){
   while(paused&&!stopped)await new Promise(resolve=>setTimeout(resolve,100));if(stopped)break;
   try{const file=path.join(historyDir,name),info=await stat(file),latest=db.prepare('SELECT source_mtime,has_file FROM images WHERE result_id=? ORDER BY has_file LIMIT 1').get(name.slice(0,-5));
    if(!latest||latest.source_mtime!==info.mtimeMs||!latest.has_file){const entry=JSON.parse(await readFile(file,'utf8'));if(entry.id!==name.slice(0,-5)||!Array.isArray(entry.images))throw Error('record mismatch');await indexEntry(entry,{mtime:info.mtimeMs});}
   }catch(error){broken++;lastError=`${name}: ${error.message}`;}
   scanned++;if(scanned%16===0)await sleep();
  }
  missing=db.prepare('SELECT count(*) AS n FROM images WHERE has_file=0').get().n;
  duplicates=db.prepare('SELECT coalesce(sum(n-1),0) AS n FROM (SELECT count(*) AS n FROM images WHERE filename<>\'\' GROUP BY filename HAVING n>1)').get().n;
 }
 function start(){if(closing)return Promise.resolve();if(!scanPromise){stopped=false;paused=false;scanPromise=scan().catch(error=>{lastError=error.message;}).finally(()=>{scanPromise=null;});}return scanPromise;}
 function status(){return {running:!!scanPromise,paused,scanned,total,broken,missing,duplicates,lastError,indexed:db?db.prepare('SELECT count(*) AS n FROM images').get().n:0};}
 async function search(input={}){
  await init();const limit=Math.min(100,Math.max(1,Number(input.limit)||40));
  const where=[],args={};const q=string(input.q,200).trim();
  if(q){if(q.length>=3){where.push('i.key IN (SELECT key FROM image_text WHERE image_text MATCH @match)');args.match=`"${q.replaceAll('"','""')}"`;}else{where.push("(i.prompt LIKE @like ESCAPE '!' OR i.final_prompt LIKE @like ESCAPE '!' OR i.filename LIKE @like ESCAPE '!' OR EXISTS (SELECT 1 FROM image_text t WHERE t.key=i.key AND t.text LIKE @like ESCAPE '!'))");args.like=`%${q.replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')}%`;}}
  if(input.seed!==undefined&&String(input.seed).trim()!==''){if(!/^\d{1,10}$/.test(String(input.seed)))throw Error('seed 必须是非负整数');where.push('i.seed=@seed');args.seed=String(input.seed);}
  for(const [field,value] of [['model',input.model],['mode',input.mode]])if(value){where.push(`i.${field}=@${field}`);args[field]=string(value,128);}
  if(input.from){if(!/^\d{4}-\d\d-\d\d$/.test(input.from))throw Error('起始日期无效');where.push('i.created_at>=@from');args.from=`${input.from}T00:00:00`;}
  if(input.to){if(!/^\d{4}-\d\d-\d\d$/.test(input.to))throw Error('截止日期无效');where.push('i.created_at<@to');args.to=`${input.to}T23:59:59.999Z`;}
  if(input.favorite==='1'||input.favorite===true){const keys=Object.entries(annotations.items||{}).filter(([,a])=>a.favorite).map(([key])=>key);if(!keys.length)return {items:[],nextCursor:null,total:0,index:status()};where.push(`i.key IN (${keys.map((_,i)=>`@favorite${i}`).join(',')})`);keys.forEach((key,i)=>args[`favorite${i}`]=key);}
  if(input.cursor){let cursor;try{cursor=JSON.parse(Buffer.from(String(input.cursor),'base64url').toString('utf8'));}catch{throw Error('图库游标无效');}if(!Array.isArray(cursor)||cursor.length!==2||typeof cursor[0]!=='string'||typeof cursor[1]!=='string')throw Error('图库游标无效');where.push('(i.created_at<@cursorDate OR (i.created_at=@cursorDate AND i.key<@cursorKey))');args.cursorDate=cursor[0];args.cursorKey=cursor[1];}
  const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
  const rows=db.prepare(`SELECT i.* FROM images i ${clause} ORDER BY i.created_at DESC,i.key DESC LIMIT @pageLimit`).all({...args,pageLimit:limit+1});
  const hasMore=rows.length>limit;const page=rows.slice(0,limit);const last=page.at(-1);
  return {items:page.map(row=>publicRow(row,annotations.items?.[row.key])),nextCursor:hasMore?Buffer.from(JSON.stringify([last.created_at,last.key])).toString('base64url'):null,index:status()};
 }
 async function get(resultId,index){await init();const key=imageKey(resultId,index);if(!KEY.test(key))throw Error('图库图片 ID 无效');const row=db.prepare('SELECT * FROM images WHERE key=?').get(key);if(!row)return null;
  let entry=null;try{entry=JSON.parse(await readFile(path.join(historyDir,`${resultId}.json`),'utf8'));if(entry.id!==resultId)entry=null;}catch{}
  return {...publicRow(row,annotations.items?.[key]),entry};
 }
 function annotate(resultId,index,patch){
  const key=imageKey(resultId,index);if(!KEY.test(key))throw Error('图库图片 ID 无效');
  const run=annotationTail.catch(()=>{}).then(async()=>{await init();if(!db.prepare('SELECT 1 FROM images WHERE key=?').get(key))throw Error('图片未在图库索引中');
   const old=annotations.items?.[key]||{},next={favorite:patch.favorite===undefined?!!old.favorite:!!patch.favorite,tags:patch.tags===undefined?old.tags||[]:normalizeTags(patch.tags)};
   const before=annotations.items;annotations.items={...before,[key]:next};try{await saveAnnotations();}catch(error){annotations.items=before;throw error;}
   const row=db.prepare('SELECT prompt,final_prompt,filename FROM images WHERE key=?').get(key);try{db.prepare('DELETE FROM image_text WHERE key=?').run(key);db.prepare('INSERT INTO image_text(key,text) VALUES(?,?)').run(key,[row.prompt,row.final_prompt,row.filename,next.tags.join(' ')].join(' '));}catch(error){lastError=`标签搜索索引待修复：${error.message}`;}
   return {key,...next};});annotationTail=run;return run;
 }
 async function rebuild(){await init();paused=false;stopped=true;if(scanPromise)await scanPromise;db.exec('DELETE FROM image_text; DELETE FROM images;');scanned=total=broken=missing=duplicates=0;lastError='';return start();}
 async function exportAnnotations(){await init();return {format:'lucifer-generated-library-annotations',version:1,items:structuredClone(annotations.items||{})};}
 async function importAnnotations(bundle){await init();if(bundle?.format!=='lucifer-generated-library-annotations'||bundle.version!==1||!bundle.items||typeof bundle.items!=='object'||Array.isArray(bundle.items))throw Error('图库注释备份格式无效');
  const next={...annotations.items};for(const [key,value] of Object.entries(bundle.items)){if(!KEY.test(key))throw Error('图库注释备份包含无效 ID');next[key]={favorite:!!value?.favorite,tags:normalizeTags(value?.tags||[])};}
  const old=annotations.items;annotations.items=next;try{await saveAnnotations();}catch(error){annotations.items=old;throw error;}
  try{db.exec('BEGIN IMMEDIATE');const remove=db.prepare('DELETE FROM image_text WHERE key=?'),add=db.prepare('INSERT INTO image_text(key,text) VALUES(?,?)'),read=db.prepare('SELECT prompt,final_prompt,filename FROM images WHERE key=?');for(const [key,value] of Object.entries(bundle.items)){const row=read.get(key);if(!row)continue;remove.run(key);add.run(key,[row.prompt,row.final_prompt,row.filename,value.tags.join(' ')].join(' '));}db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');lastError=`导入标签的查询索引待修复：${error.message}`;}
  return {imported:Object.keys(bundle.items).length};
 }
 return {init,start,pause(){paused=true;},resume(){if(scanPromise)paused=false;else start();},stop(){stopped=true;paused=false;},status,indexEntry,search,get,annotate,rebuild,exportAnnotations,importAnnotations,async close(){closing=true;stopped=true;paused=false;if(initPromise)await initPromise.catch(()=>{});if(scanPromise)await scanPromise;await annotationTail.catch(()=>{});while(activeWrites)await sleep();db?.close();db=null;}};
}
