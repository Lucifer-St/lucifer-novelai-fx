#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {defaults,buildRequest,validateRequest,stateFromPayload,schema,MODEL_ID} from '../src/lib/request.mjs';
import {NEVER_SEND_PARAMETERS} from '../src/lib/parameter-policy.mjs';
import {planOpusBatch} from '../src/lib/opus-batch.mjs';
import {MODEL_IDS,validateModelPayload} from '../src/lib/model-policy.mjs';

const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const text={type:'string'},uuid={type:'string',pattern:'^[a-fA-F0-9-]{36}$'};
const tool=(name,description,inputSchema,readOnlyHint=true)=>({name,description,inputSchema,annotations:{readOnlyHint,destructiveHint:name==='fx_job_stop',idempotentHint:readOnlyHint,openWorldHint:name==='fx_generate'}});
export const MCP_TOOLS=[
 tool('fx_status','读取正在运行的本机 Lucifer FX 状态，不访问网关。',object()),
 tool('fx_defaults','读取 V5 Full 或 V4.5 编辑参数模板。',object({model:text})),
 tool('fx_schema','读取受支持参数 schema。',object()),
 tool('fx_plan','离线验证参数，冻结 seed 和任务 ID。不会生图。',object({state:{type:'object'},opusBatch:{type:'boolean'}},['state'])),
 tool('fx_generate','仅在用户明确要求生图时，提交 fx_plan 返回的冻结计划一次。可能计费，不自动重试；回执不明确时先按原 ID 查询。',object({plan:{type:'object'}},['plan']),false),
 tool('fx_job_get','查询已提交任务，不会重试生成。',object({id:uuid},['id'])),
 tool('fx_job_stop','停止任务后续图片，保留已完成图片。',object({id:uuid},['id']),false),
 tool('fx_history','读取本地最近生成历史。',object({limit:{type:'integer',minimum:1,maximum:200}})),
 tool('fx_recipe','读取历史图片的原始请求快照。',object({id:text},['id'])),
 tool('fx_save','把历史结果另存到用户保存目录，不会重新生成。',object({id:text,index:{type:'integer',minimum:0,maximum:7}},['id']),false),
 tool('fx_library_list','查找本地卡片、预设和草稿。',object({query:text,kind:text})),
 tool('fx_library_get','读取一个完整卡片、预设或草稿。',object({id:uuid},['id'])),
 tool('fx_library_put','保存本地卡片、预设或草稿；更新需要原 id 和 revision。不会改动浏览器未保存的编辑内容。',object({entry:{type:'object'}},['entry']),false),
 tool('fx_anlas','读取跨重启保留的本地累计账本，不是实时网关余额。',object()),
];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function checkId(id,history=false){if(!(history?/^\d+-[a-f0-9-]+$/:UUID).test(id||''))throw Error('记录 ID 无效。');return id;}
function validatePlan(plan){
 if(plan?.format!=='lucifer-fx-plan'||plan.version!==1||typeof plan.opusBatch!=='boolean')throw Error('需要 fx_plan 返回的冻结计划。');
 checkId(plan.clientRequestId);const body=plan.payload?.novelai?.body;
  if(!MODEL_IDS.includes(plan.payload?.model)||!body||!['generate','img2img','infill'].includes(body.action))throw Error('只支持 V5 Full 或 V4.5 生图计划。');
  validateModelPayload(plan.payload);
 if(Object.keys(body.parameters||{}).some(k=>NEVER_SEND_PARAMETERS.has(k)))throw Error('计划含禁止转发的测试参数。');
 if(!Number.isInteger(body.parameters?.seed)||body.parameters.seed<0)throw Error('计划需要已冻结的非负 seed，请重新调用 fx_plan。');
 validateRequest(stateFromPayload(plan.payload),plan.payload);if(plan.opusBatch)planOpusBatch(plan.payload);return plan;
}
export function createMcpHandler({port=8790,fetchImpl=fetch}={}){
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口无效。');
 const origin=`http://127.0.0.1:${port}`;
 async function request(route,body){
  const response=await fetchImpl(origin+route,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json',Origin:origin,...body!==undefined?{'Content-Type':'application/json'}:{}},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>32*1024*1024)throw Error('响应过大。');chunks.push(Buffer.from(chunk));}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!response.ok)throw Error(data.error?.message||`HTTP ${response.status}`);return data;
 }
 async function call(name,args){
  const spec=MCP_TOOLS.find(t=>t.name===name);if(!spec)throw Error('未知 MCP 工具。');
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(spec.inputSchema.properties,k))||spec.inputSchema.required.some(k=>args[k]===undefined))throw Error('工具参数无效。');
  if(name==='fx_defaults'){const model=args.model||MODEL_ID;if(!MODEL_IDS.includes(model))throw Error('不支持的模型。');return defaults(model);}if(name==='fx_schema')return schema;
  if(name==='fx_plan'){
   if(!args.state||typeof args.state!=='object'||Array.isArray(args.state))throw Error('state 必须为编辑参数对象。');
   const model=args.state.model||MODEL_ID;if(!MODEL_IDS.includes(model))throw Error('不支持的模型。');
   const state={...defaults(model),...args.state};if(!['generate','img2img','infill'].includes(state.mode))throw Error('生成模式无效。');
   const payload=buildRequest(state,{resolveSeed:true});return validatePlan({format:'lucifer-fx-plan',version:1,clientRequestId:randomUUID(),opusBatch:args.opusBatch===true,payload});
  }
  const status=await request('/api/status');if(!String(status.app).startsWith('Lucifer NovelAI FX')||!status.generationJobs)throw Error('目标端口不是支持任务恢复的 Lucifer FX。请先启动对应应用。');
  if(name==='fx_status')return status;
  if(name==='fx_generate'){
   const plan=validatePlan(args.plan);try{return await request('/api/generation-jobs',{clientRequestId:plan.clientRequestId,payload:plan.payload,opusBatch:plan.opusBatch});}
   catch(e){throw Error(`${e.message}；未自动重试。先使用 fx_job_get 查询 ${plan.clientRequestId}，不要创建新 ID 重复提交。`);}
  }
  if(name==='fx_job_get')return request('/api/generation-jobs/'+checkId(args.id));
  if(name==='fx_job_stop')return request('/api/generation-jobs/'+checkId(args.id)+'/stop',{});
  if(name==='fx_history'){const limit=args.limit??20;if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('limit 需要为 1–200。');const d=await request('/api/history');return {...d,entries:d.entries.slice(0,limit)};}
  if(name==='fx_recipe')return request('/api/results/'+checkId(args.id,true)+'-request.json');
  if(name==='fx_save'){const index=args.index??0;if(!Number.isInteger(index)||index<0||index>7)throw Error('图片序号无效。');return request('/api/save-result',{id:checkId(args.id,true),index});}
  if(name==='fx_library_list'){const d=await request('/api/library?'+new URLSearchParams({q:args.query||'',kind:args.kind||''}));return {...d,entries:d.entries.map(({cover,...entry})=>({...entry,hasCover:!!cover}))};}
  if(name==='fx_library_get')return request('/api/library/'+checkId(args.id));
  if(name==='fx_library_put')return request('/api/library',args.entry);
  if(name==='fx_anlas')return request('/api/anlas');
 }
 let initialized=false;
 return async message=>{
  const id=message?.id??null,error=(code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
  if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')return error(-32600,'Invalid Request');
  if(message.id===undefined)return null;
  let result;
  if(message.method==='initialize'){initialized=true;const requested=message.params?.protocolVersion;result={protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(requested)?requested:'2025-11-25',capabilities:{tools:{listChanged:false}},serverInfo:{name:'lucifer-novelai-fx',version:'1.0.0'},instructions:'用户明确要求时才生成；先 fx_plan 再 fx_generate。生成失败或回执不明时查询原 ID，绝不自动重试。安装/测试只调用只读工具。FX 应用需要先启动。'};}
  else if(message.method==='ping')result={};
  else if(!initialized)return error(-32002,'Initialize first');
  else if(message.method==='tools/list')result={tools:MCP_TOOLS};
  else if(message.method==='tools/call'){
   try{const data=await call(message.params?.name,message.params?.arguments||{});result={content:[{type:'text',text:JSON.stringify(data)}],isError:false};}
   catch(e){result={content:[{type:'text',text:e.message}],isError:true};}
  }else return error(-32601,'Method not found');
  return {jsonrpc:'2.0',id,result};
 };
}
export async function runStdio({input=process.stdin,output=process.stdout,port=8790}={}){
 const handle=createMcpHandler({port}),decoder=new StringDecoder('utf8');let pending='';
 const send=data=>{if(data)output.write(JSON.stringify(data)+'\n');};
 for await(const chunk of input){pending+=typeof chunk==='string'?chunk:decoder.write(chunk);if(Buffer.byteLength(pending)>32*1024*1024)throw Error('MCP request exceeds 32 MiB.');let index;
  while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);if(!line.trim())continue;let message;try{message=JSON.parse(line);}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});continue;}send(await handle(message));}
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2);const port=args.length===0?8790:args.length===2&&args[0]==='--port'?Number(args[1]):NaN;
 runStdio({port}).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
}
