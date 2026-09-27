#!/usr/bin/env node
import {readFile,writeFile,stat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {parseArgs,promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {defaults,buildRequest,validateRequest,stateFromPayload,parseObject,schema,MODEL_ID} from '../src/lib/request.mjs';
import {NEVER_SEND_PARAMETERS} from '../src/lib/parameter-policy.mjs';
import {planOpusBatch} from '../src/lib/opus-batch.mjs';
import {MODEL_IDS,SUPPORTED_MODELS,modelSpec,validateModelPayload} from '../src/lib/model-policy.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MAX_JSON=32*1024*1024;
const LIVE=new Set(['queued','running','stopping']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HISTORY_ID=/^\d+-[a-f0-9-]+$/;
const generationFlags=['state','model','prompt','prompt-file','negative','negative-file','width','height','steps','scale','seed','count','sampler','no-quality','transparent-bg','opus-batch','id'];
const definitions={
 'help':{args:0,flags:['json'],usage:'help [--json]',description:'查看命令与机器可读能力清单'},
 'start':{args:0,flags:[],usage:'start',description:'启动本地 FX 服务；已运行时直接连接，不打开浏览器'},
 'status':{args:0,flags:[],usage:'status',description:'读取本地状态，不访问生图网关'},
 'models':{args:0,flags:[],usage:'models',description:'只读检查网关模型目录'},
 'schema':{args:0,flags:['model','out'],usage:'schema [--model nai-diffusion-4-5-full] [--out schema.json]',description:'离线读取受支持模型参数 schema'},
 'defaults':{args:0,flags:['model','out'],usage:'defaults [--model nai-diffusion-4-5-full] [--out state.json]',description:'离线导出所选模型编辑参数模板'},
 'plan':{args:0,flags:[...generationFlags,'out'],usage:'plan --state state.json [--out plan.json]',description:'离线验证参数，冻结 seed 和任务 ID，不提交请求'},
 'generate':{args:0,flags:[...generationFlags,'plan','wait','timeout','interval'],usage:'generate --plan plan.json [--wait]',description:'提交一次可能计费的生图任务；不自动重试',mutating:true,billing:'possible'},
 'job get':{args:1,flags:[],usage:'job get JOB_ID',description:'查询同一后台任务'},
 'job wait':{args:1,flags:['timeout','interval'],usage:'job wait JOB_ID [--timeout 600]',description:'只用 GET 等待任务；退出或等待超时不停止后台任务'},
 'job stop':{args:1,flags:[],usage:'job stop JOB_ID',description:'停止单张本地接收／停止批次后续图片；保留已完成结果',mutating:true},
 'history':{args:0,flags:['limit','before','full','out'],usage:'history [--limit 20] [--before HISTORY_ID] [--full]',description:'分页查看历史；响应的 nextCursor 可传给 --before'},
 'recipe':{args:1,flags:['out'],usage:'recipe HISTORY_ID [--out request.json]',description:'读取历史图像的完整请求快照'},
 'save':{args:1,flags:['index'],usage:'save HISTORY_ID [--index 0]',description:'将指定结果主动复制到保存目录；不重新生成',mutating:true},
 'library list':{args:0,flags:['query','kind','full','out'],usage:'library list [--query 名称] [--kind preset]',description:'搜索本地卡片、完整预设、草稿或收藏'},
 'library get':{args:1,flags:['out'],usage:'library get LIBRARY_ID [--out entry.json]',description:'读取完整库条目'},
 'library put':{args:0,flags:['file'],usage:'library put --file entry.json',description:'创建条目；更新已有条目需要其 id 和 revision',mutating:true},
 'library export':{args:0,flags:['out'],usage:'library export [--out library.json]',description:'导出本地库，可能含用户文本与封面'},
 'library import':{args:0,flags:['file'],usage:'library import --file library.json',description:'导入为新条目，不覆盖原有条目',mutating:true},
 'gallery':{args:0,flags:['query','rating','sort','period','page','page-size'],usage:'gallery [--query landscape] [--period week]',description:'匿名只读查询 D 站，不读取图片或调用生图网关'},
 'anlas':{args:0,flags:[],usage:'anlas',description:'读取本地 Anlas 账本；不是实时网关余额'},
};
const booleanFlags=new Set(['help','json','wait','full','no-quality','transparent-bg','opus-batch']);
const flags=new Set(['help','port',...Object.values(definitions).flatMap(d=>d.flags)]);
const options=Object.fromEntries([...flags].map(name=>[name,{type:booleanFlags.has(name)?'boolean':'string'}]));

export class CLIError extends Error{
 constructor(code,message,details={},exitCode=1){super(message);this.code=code;this.details=details;this.exitCode=exitCode;}
}
function usage(message){throw new CLIError('usage',message,{},2);}
function number(value,name,{min,max,integer=false}={}){
 const n=Number(value);if(value===''||!Number.isFinite(n)||(integer&&!Number.isInteger(n))||(min!==undefined&&n<min)||(max!==undefined&&n>max))usage(`${name} 数值无效。`);return n;
}
function uuid(value){if(!UUID.test(value||''))usage('需要本地任务／库条目的 UUID，不是网关的六位请求编号。');return value.toLowerCase();}
function historyId(value){if(!HISTORY_ID.test(value||''))usage('需要历史记录 ID，例如 1790000000000-ab123456。');return value;}
function selectedModel(value){if(!MODEL_IDS.includes(value||MODEL_ID))usage('模型必须为 V5 Full、V4.5 Full 或 V4.5 Curated。');return modelSpec(value||MODEL_ID);}
async function inputText(file,stdin){
 if(file==='-'){const chunks=[];let bytes=0;for await(const part of stdin){const chunk=Buffer.from(part);bytes+=chunk.length;if(bytes>MAX_JSON)usage('输入超过 32 MiB。');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,'');}
 if((await stat(file)).size>MAX_JSON)usage('输入文件超过 32 MiB。');return (await readFile(file,'utf8')).replace(/^\uFEFF/,'');
}
async function inputJSON(file,stdin){
 if(!file)usage('请使用 --file、--state 或 --plan 指定 JSON 文件；- 表示标准输入。');
 let data;try{data=JSON.parse(await inputText(file,stdin));}catch(e){if(e instanceof CLIError)throw e;throw new CLIError('invalid_json',`无法读取 JSON：${e.message}`,{},2);}
 if(!data||typeof data!=='object'||Array.isArray(data))usage('JSON 顶层必须是对象。');return data;
}
async function makePlan(v,stdin){
 if(v.plan){
  if(generationFlags.some(k=>v[k]!==undefined))usage('--plan 不能与参数覆盖选项同时使用；请先创建新计划。');
  const plan=await inputJSON(v.plan,stdin);if(plan.format!=='lucifer-fx-plan'||plan.version!==1)usage('不是 FX CLI 计划文件。');plan.clientRequestId=uuid(plan.clientRequestId);
  if(typeof plan.opusBatch!=='boolean')usage('计划的 opusBatch 必须为布尔值。');
  const body=plan.payload?.novelai?.body;if(!MODEL_IDS.includes(plan.payload?.model)||!body||!['generate','img2img','infill'].includes(body.action))usage('计划必须是受支持的 V5 Full 或 V4.5 生图请求。');
  validateModelPayload(plan.payload);
  if(Object.keys(body.parameters||{}).some(k=>NEVER_SEND_PARAMETERS.has(k)))usage('计划包含禁止转发的旧测试参数，请重新准备计划。');
  validateRequest(stateFromPayload(plan.payload),plan.payload);if(plan.opusBatch)planOpusBatch(plan.payload);return plan;
 }
 const imported=v.state?await inputJSON(v.state,stdin):{};
 const source=imported.state||imported.payload?.state||imported.payload||imported;
 if(v.model&&source.model&&v.model!==source.model)usage('--model 与状态文件的 model 不一致。');
 const spec=selectedModel(v.model||source.model),state={...defaults(spec.id),...source,model:spec.id};
 if(!['generate','img2img','infill'].includes(state.mode))usage('mode 必须为 generate、img2img 或 infill。');
 if(v.prompt!==undefined&&v['prompt-file'])usage('--prompt 与 --prompt-file 请选择其一。');
 if(v.negative!==undefined&&v['negative-file'])usage('--negative 与 --negative-file 请选择其一。');
 if(v.prompt!==undefined)state.prompt=v.prompt;if(v['prompt-file'])state.prompt=await inputText(v['prompt-file'],stdin);
 if(v.negative!==undefined)state.negative=v.negative;if(v['negative-file'])state.negative=await inputText(v['negative-file'],stdin);
 const extra=parseObject(state.extraJSON||'{}');
 for(const [provided,key] of [[v.prompt!==undefined||!!v['prompt-file'],'v4_prompt'],[v.negative!==undefined||!!v['negative-file'],'v4_negative_prompt']])if(provided&&(extra[key]||state.overrides?.[key]))usage(`状态含完整 ${key} 覆盖，请在状态文件中修改该字段，避免覆盖其中的角色信息。`);
 for(const name of ['width','height','steps','scale','seed','count'])if(v[name]!==undefined){const n=number(v[name],name);state[name==='count'?'n':name]=n;extra[name==='count'?'n_samples':name]=n;}
 if(v.negative!==undefined||v['negative-file'])extra.negative_prompt=state.negative;
 if(v.sampler){state.sampler=v.sampler;extra.sampler=v.sampler;}if(v['no-quality']){state.quality=false;extra.qualityToggle=false;if(spec.id===MODEL_ID)extra.tag_hint_qt=0;}if(v['transparent-bg'])extra.tag_hint_transparent_background=true;
 state.extraJSON=JSON.stringify(extra);
 const payload=buildRequest(state,{resolveSeed:true});validateRequest(state,payload);
 const opusBatch=!!v['opus-batch'],requests=opusBatch?planOpusBatch(payload).length:1;
 return {format:'lucifer-fx-plan',version:1,clientRequestId:v.id?uuid(v.id):randomUUID(),opusBatch,requests,payload,notice:'plan 不提交生成。generate 可能消耗网关费用；Opus 条件不代表网关免费。'};
}
function jobView(job){const {preview,...rest}=job;return {...rest,...(preview?{previewAvailable:true}:{})};}
function help(){return 'Lucifer NovelAI FX CLI\n\n'+Object.values(definitions).map(d=>`  fx ${d.usage}\n     ${d.description}`).join('\n')+'\n\n自动使用本安装的端口记录，默认 8796；--port 可显式选择端口。JSON 默认输出到 stdout；错误 JSON 输出到 stderr。\n文本很长时使用 --prompt-file；完整参数使用 --state。随机 seed 可省略或写 --seed=-1。\n--out 仅用于离线或只读命令，不覆盖已有文件。不会自动重试生成。\n';}
async function installationRoot(){try{await stat(path.join(ROOT,'..','runtime','node.exe'));return path.resolve(ROOT,'..');}catch{return ROOT;}}
async function savedPort(){try{const value=Number((await readFile(path.join(await installationRoot(),'userdata','launcher.port'),'utf8')).trim());if(Number.isInteger(value)&&value>0&&value<=65535)return value;}catch{}return 8796;}
async function launch(){
 if(process.platform!=='win32')throw new CLIError('start_unavailable','请先手动启动分享版服务。');
 const root=await installationRoot(),launcher=path.join(root,'启动 Lucifer FX.exe');
 try{await stat(launcher);}catch{throw new CLIError('start_unavailable','请先打开 Windows 分享版，或在源码目录运行 npm start。');}
 await promisify(execFile)(launcher,[],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:65536,env:{...process.env,FX_SHARE_NO_OPEN:'1',NODE_OPTIONS:'',NODE_PATH:''}});return savedPort();
}

export async function runCLI(args,{fetchImpl=fetch,stdin=process.stdin,startService=launch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let parsed;try{parsed=parseArgs({args,options,allowPositionals:true,strict:true});}catch(e){usage(e.message);}
 const v=parsed.values,pos=[...parsed.positionals];let command=pos.shift()||'help';if(['job','library'].includes(command))command+=' '+(pos.shift()||(command==='library'?'list':'get'));
 if(v.help)command='help';const definition=definitions[command];if(!definition)usage('未知命令。使用 fx help 查看支持的命令。');
 if(!v.help&&pos.length!==definition.args)usage(`用法：fx ${definition.usage}`);
 for(const flag of Object.keys(v))if(!['help','port'].includes(flag)&&!definition.flags.includes(flag))usage(`${command} 不支持 --${flag}。`);
 if(['state','plan','file','prompt-file','negative-file'].filter(k=>v[k]==='-').length>1)usage('标准输入只能作为一个输入文件。');
 if(v.timeout!==undefined)number(v.timeout,'timeout',{min:0,max:3600});if(v.interval!==undefined)number(v.interval,'interval',{min:250,max:5000,integer:true});
 if(command==='generate'&&!v.wait&&(v.timeout!==undefined||v.interval!==undefined))usage('generate 的 --timeout / --interval 需要同时使用 --wait，仅控制 CLI 等待。');
 let port=number(v.port??await savedPort(),'port',{min:1,max:65535,integer:true}),origin=`http://127.0.0.1:${port}`;
 const installedRoot=await installationRoot(),expectedInstall=v.port===undefined&&path.resolve(installedRoot)!==path.resolve(ROOT)?createHash('sha256').update(path.resolve(installedRoot).replace(/[\\/]$/,'').toUpperCase()).digest('hex').slice(0,24).toUpperCase():null;
 if(command==='help')return {text:v.json?undefined:help(),data:v.json?{cliVersion:1,origin,commands:definitions,exitCodes:{success:0,requestError:1,usage:2,jobFailed:3,stillRunning:4}}:undefined,exitCode:0};
 async function prepare(){try{return await makePlan(v,stdin);}catch(e){if(e instanceof CLIError)throw e;throw new CLIError('invalid_parameters',e.message,{},2);}}
 async function request(route,{method='GET',body,timeout=15000}={}){
  try{
   const response=await fetchImpl(origin+route,{method,headers:{Accept:'application/json',Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout),redirect:'error'});
   const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>MAX_JSON)throw new CLIError('response_too_large','响应超过 CLI 的 32 MiB 限制。');chunks.push(Buffer.from(chunk));}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new CLIError('invalid_response','本地服务未返回有效 JSON。',{status:response.status});}
   if(!response.ok)throw new CLIError(data.error?.code||'request_error',data.error?.message||`HTTP ${response.status}`,{status:response.status,...data.error});return data;
  }catch(e){if(e instanceof CLIError)throw e;throw new CLIError('connection',`本地 FX 请求未完成：${e.message}。未自动重试；服务未启动时可用 fx start。`,{route,method,networkCode:e.cause?.code||e.code});}
 }
 async function connect(){const status=await request('/api/status');if(status.app!=='Lucifer NovelAI FX'||!status.shareEdition||!status.generationJobs)throw new CLIError('wrong_service','该端口不是受支持的 Lucifer NovelAI FX 服务。');if(expectedInstall&&status.installId!==expectedInstall)throw new CLIError('wrong_service','此端口不属于这份安装，请先运行同目录的启动器。');return status;}
 async function wait(id){
  const seconds=number(v.timeout??600,'timeout',{min:0,max:3600}),interval=number(v.interval??1000,'interval',{min:250,max:5000,integer:true}),deadline=Date.now()+seconds*1000;let job;
  while(true){job=await request('/api/generation-jobs/'+id);if(!LIVE.has(job.status))return {data:jobView(job),exitCode:job.status==='success'?0:3};if(Date.now()>=deadline)return {data:{waiting:true,job:jobView(job),notice:'只结束 CLI 等待，后台任务继续；稍后查询同一 ID，不要重新提交。'},exitCode:4};await sleep(Math.min(interval,Math.max(1,deadline-Date.now())));}
 }
 let data,exitCode=0;
 if(command==='defaults')data={format:'novelai-studio',version:1,state:defaults(selectedModel(v.model).id)};
 else if(command==='schema')data={model:selectedModel(v.model).id,modelSchema:selectedModel(v.model),supportedModels:SUPPORTED_MODELS,imageParameters:schema.imageParameters};
 else if(command==='plan')data=await prepare();
 else if(command==='start'){
  try{data=await connect();}catch(e){if(e.code!=='connection'||e.details.networkCode!=='ECONNREFUSED')throw e;const startedPort=await startService(port);if(startedPort!==undefined){if(v.port!==undefined&&Number(v.port)!==startedPort)throw new CLIError('port_mismatch','启动器选择了端口 '+startedPort+'，请省略 --port 或使用该端口。');port=number(startedPort,'port',{min:1,max:65535,integer:true});origin=`http://127.0.0.1:${port}`;}data=await connect();}
 }else if(command==='generate'){
  const plan=await prepare();await connect();let job;
  try{job=await request('/api/generation-jobs',{method:'POST',body:{clientRequestId:plan.clientRequestId,payload:plan.payload,opusBatch:plan.opusBatch}});}
  catch(e){throw new CLIError(e.code,e.message,{...e.details,clientRequestId:plan.clientRequestId,submissionUnknown:!e.details.status||e.details.status>=500,nextCommand:`fx job get ${plan.clientRequestId}${port===8790?'':` --port ${port}`}`,notice:'未自动重试。若回执不明确，先查询同一任务 ID。'},e.exitCode);}
  if(v.wait)return wait(plan.clientRequestId);data={accepted:true,clientRequestId:plan.clientRequestId,job:jobView(job),nextCommand:`fx job wait ${plan.clientRequestId}${port===8790?'':` --port ${port}`}`};
 }else{
  const status=await connect();
  if(command==='status')data=status;
  else if(command==='models')data=await request('/api/models');
  else if(command==='anlas')data=await request('/api/anlas');
  else if(command==='job get')data=jobView(await request('/api/generation-jobs/'+uuid(pos[0])));
  else if(command==='job wait')return wait(uuid(pos[0]));
  else if(command==='job stop')data=await request('/api/generation-jobs/'+uuid(pos[0])+'/stop',{method:'POST',body:{}});
  else if(command==='history'){
   const limit=number(v.limit??20,'limit',{min:1,max:200,integer:true}),query=new URLSearchParams({limit:String(limit)});if(v.before)query.set('before',historyId(v.before));const result=await request('/api/history?'+query);const entries=result.entries;
   data={available:entries.length,nextCursor:result.nextCursor||null,entries:v.full?entries:entries.map(e=>({id:e.id,status:e.status,createdAt:e.createdAt,model:e.model,prompt:e.prompt?.slice(0,180),durationMs:e.durationMs,images:e.images,error:e.error,requestUrl:e.requestUrl}))};
  }else if(command==='recipe')data=await request(`/api/results/${historyId(pos[0])}-request.json`);
  else if(command==='save')data=await request('/api/save-result',{method:'POST',body:{id:historyId(pos[0]),index:number(v.index??0,'index',{min:0,max:7,integer:true})}});
  else if(command==='library list'){
   data=await request('/api/library?'+new URLSearchParams({q:v.query||'',kind:v.kind||''}));if(!v.full)data={...data,entries:data.entries.map(({cover,...entry})=>({...entry,hasCover:!!cover}))};
  }else if(command==='library get')data=await request('/api/library/'+uuid(pos[0]));
  else if(command==='library put'||command==='library import')data=await request(command==='library put'?'/api/library':'/api/library/import',{method:'POST',body:await inputJSON(v.file,stdin)});
  else if(command==='library export')data=await request('/api/library/export');
  else if(command==='gallery')data=await request('/api/danbooru/posts?'+new URLSearchParams({q:v.query||'',rating:v.rating||'g',sort:v.sort||'latest',period:v.period||'all',page:String(number(v.page??1,'page',{min:1,max:1000,integer:true})),pageSize:String(number(v['page-size']??16,'page-size',{min:12,max:48,integer:true}))}));
 }
 if(v.out){const destination=path.resolve(v.out);await writeFile(destination,JSON.stringify(data,null,2)+'\n',{flag:'wx'});return {data:{written:destination},exitCode};}
 return {data,exitCode};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{const result=await runCLI(process.argv.slice(2));process.stdout.write(result.text??JSON.stringify(result.data,null,2)+'\n');process.exitCode=result.exitCode;}
 catch(e){process.stderr.write(JSON.stringify({error:{code:e.code||'cli_error',message:e.message,...e.details}},null,2)+'\n');process.exitCode=e.exitCode||1;}
}
