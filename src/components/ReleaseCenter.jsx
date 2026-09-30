import {useEffect, useId, useRef, useState} from 'react';
import {Bug, CheckCircle2, Clipboard, Download, ExternalLink, Lightbulb, RefreshCw, ShieldAlert, X} from 'lucide-react';
import {api} from '../lib/api.mjs';
import {copyText, openExternal, saveBlob} from '../lib/platform.mjs';
import '../release-center.css';

const EMPTY_FEEDBACK={summary:'',steps:'',expected:'',actual:''};
const STATUS_COPY={
 unconfigured:'发布仓库待配置',
 not_checked:'尚未检查',
 current:'无更高稳定版',
 update_available:'发现新稳定版',
 no_release:'暂无稳定版',
 network_error:'检查失败',
 repository_error:'仓库配置异常',
};
const DIAGNOSTIC_LABELS={
 provider:{official:'NovelAI 官方',native:'兼容网关 · Native',openai:'兼容网关 · OpenAI',not_configured:'尚未配置',unknown:'不确定'},
 featureLocation:{update_center:'更新 / 反馈',generation:'生成',prompt_editor:'提示词编辑',image_import:'图片导入',gallery:'图库',history:'历史记录',settings:'设置',agent_mcp:'Agent / MCP',other:'其他'},
 knownErrorCode:{none:'没有错误码',gateway_connect_error:'gateway_connect_error',gateway_connection_error:'gateway_connection_error',gateway_timeout:'gateway_timeout',generation_busy:'generation_busy',invalid_request:'invalid_request',storage_error:'storage_error',update_check_failed:'update_check_failed',unknown:'不确定'},
};

function cleanLine(value,max=1200){return String(value||'').replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim().slice(0,max);}
function feedbackDocument(kind,form,diagnostics){
 const labels=kind==='bug'?{type:'Bug',steps:'复现步骤',expected:'预期结果',actual:'实际结果'}:{type:'改进建议',steps:'使用场景',expected:'希望改善',actual:'当前影响'};
 const lines=[`# Lucifer NovelAI FX ${labels.type}`,``, `## 摘要`,``,cleanLine(form.summary,240)||'（待填写）'];
 for(const [key,label] of [['steps',labels.steps],['expected',labels.expected],['actual',labels.actual]])lines.push('',`## ${label}`,'',cleanLine(form[key])||'（待填写）');
 lines.push('','## 安全诊断信息','','以下内容仅包含应用预先允许的字段；不含提示词、上游响应、文件路径、Key、Cookie 或日志。','');
 const entries=Object.entries(diagnostics||{});
 lines.push(...(entries.length?entries.map(([key,value])=>`- ${key}: ${value}`):['- 未提供诊断字段']));
 return lines.join('\n');
}

export function ReleaseCenter({open,onClose,appUpdate}){
 const dialogRef=useRef(null),closeRef=useRef(null),previewRef=useRef(null);
 const titleId=useId();
 const [info,setInfo]=useState(null),[check,setCheck]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [kind,setKind]=useState('bug'),[form,setForm]=useState(EMPTY_FEEDBACK),[preview,setPreview]=useState(''),[notice,setNotice]=useState('');
  const [diagnosticChoices,setDiagnosticChoices]=useState({provider:'unknown',featureLocation:'update_center',knownErrorCode:'none'});
 const [installState,setInstallState]=useState(null),[restarting,setRestarting]=useState(false);
 useEffect(()=>{if(!open)return;let disposed=false;let failures=0;
  const read=async()=>{try{const data=await api('/api/update-state',{signal:AbortSignal.timeout(3000)});if(disposed)return;setInstallState(data);failures=0;if(restarting&&['succeeded','rolled_back'].includes(data.status))location.reload();}catch{if(!disposed&&restarting&&++failures>=60)setError('服务尚未恢复，请保留安装目录，稍后重新打开启动器；更新备份在 userdata/updates。');}};
  read();const timer=setInterval(read,1500);return()=>{disposed=true;clearInterval(timer);};
 },[open,restarting]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement,dialog=dialogRef.current,controller=new AbortController();
  if(dialog&&!dialog.open)dialog.showModal();closeRef.current?.focus({preventScroll:true});
  setError('');setNotice('');
  api('/api/release-info',{signal:controller.signal}).then(data=>{setInfo(data);setCheck(null);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>{controller.abort();if(dialog?.open)dialog.close();previous?.focus?.({preventScroll:true});};
 },[open]);
 if(!open)return null;
 const result=check||appUpdate?.result||info;
 const status=result?.status||'not_checked';
 const diagnostics={...(check?.diagnostics||info?.diagnostics||{}),provider:diagnosticChoices.provider,featureLocation:diagnosticChoices.featureLocation,...(diagnosticChoices.knownErrorCode==='none'?{}:{knownErrorCode:diagnosticChoices.knownErrorCode})};
 const issueUrl=kind==='bug'?info?.links?.bug:info?.links?.improvement;
 function change(key,value){setForm(current=>({...current,[key]:value}));setPreview('');setNotice('');}
 async function checkUpdates(){if(busy)return;setBusy(true);setError('');setNotice('');try{const value=await api('/api/check-updates',{method:'POST',body:{}});setCheck(value);appUpdate?.setResult(value);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function updateApp(action){if(busy)return;setBusy(true);setError('');if(action==='install')setRestarting(true);try{
  const identity=await api('/api/status');
  const state=await api('/api/update/'+action,{method:'POST',body:{},headers:{'Content-Type':'application/json','X-FX-Action':'update','X-FX-Install-Id':identity.installId||''}});
  setInstallState(state);if(action==='install'){setRestarting(true);setNotice('正在安装并重启，请保留此页面。完成后会自动刷新；创作数据和连接配置保留。');}
 }catch(e){if(e.status)setRestarting(false);setError(e.message);}finally{setBusy(false);}}
 function makePreview(){setPreview(feedbackDocument(kind,form,diagnostics));setNotice('请检查预览；确认后再复制或导出，由你自行提交。');}
 async function copyPreview(){try{await copyText(preview);setNotice('反馈预览已复制。请在打开的 Issue 表单中自行粘贴并提交。');}catch{previewRef.current?.focus();previewRef.current?.select();setNotice('剪贴板不可用，已选中预览文本，请手动复制。');}}
 async function exportPreview(){try{await saveBlob(new Blob([preview],{type:'text/markdown;charset=utf-8'}),`Lucifer-FX-${kind}-feedback.md`);setNotice('反馈预览已导出；文件未自动上传。');}catch{setNotice('导出失败，请先复制预览文本并手动保存。');}}
 return <dialog ref={dialogRef} className="release-center" aria-modal="true" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!restarting)onClose();}}>
  <header className="release-center-header"><div><span className="release-center-kicker">Release Center</span><h2 id={titleId}>更新与反馈</h2></div><button ref={closeRef} type="button" aria-label="关闭更新与反馈" disabled={restarting} onClick={onClose}><X size={20}/></button></header>
  <div className="release-center-body">
   {error&&<p className="release-center-alert error" role="alert">{error}</p>}
   <section className="release-center-section release-center-update" aria-labelledby={`${titleId}-update`}>
    <div className="release-center-section-heading"><div><h3 id={`${titleId}-update`}>稳定版更新</h3><p>检查仅访问 GitHub 公开版本信息，不上传本地内容。下载与安装由你点击启动。</p></div><span className={`release-center-status is-${status}`}>{STATUS_COPY[status]||status}</span></div>
    {appUpdate&&<label className="update-auto"><input type="checkbox" checked={appUpdate.automatic} onChange={e=>appUpdate.setAutomatic(e.target.checked)}/>启动后自动检查，此后每 6 小时检查一次</label>}
    <div className="release-center-version-grid"><div><span>当前版本</span><strong>{result?.currentVersion||'读取中…'}</strong></div><div><span>最新稳定版</span><strong>{result?.latestVersion||'—'}</strong></div></div>
    <p className="release-center-message">{result?.message||'正在读取发行信息…'}</p>
    <div className="release-center-actions">
     <button type="button" className="primary" disabled={busy||!info} onClick={checkUpdates}><RefreshCw size={16} className={busy?'spin':''}/>{busy?'正在检查…':'检查更新'}</button>
     {result?.releaseUrl&&<button type="button" onClick={()=>openExternal(result.releaseUrl)}><ExternalLink size={16}/>查看 Release</button>}
     {result?.status==='update_available'&&result?.download?.sha256&&installState?.supported&&!['checking','downloading','verifying','cancelling','prepared','installing'].includes(installState.status)&&<button className="primary" disabled={busy} onClick={()=>updateApp('prepare')}><Download size={16}/>{['cancelled','failed'].includes(installState.status)?'重新下载并校验':'下载并校验更新'}</button>}
     {(installState?.canCancel||installState?.status==='cancelling')&&<button type="button" disabled={busy||installState.status==='cancelling'} onClick={()=>updateApp('cancel')}><X size={16}/>{installState.status==='cancelling'?'正在取消…':'取消下载'}</button>}
     {installState?.status==='prepared'&&<button className="primary" disabled={busy||restarting} onClick={()=>updateApp('install')}>安装并重启</button>}
     {result?.download?.url&&<button type="button" onClick={()=>openExternal(result.download.url)}><Download size={16}/>手动下载 ZIP</button>}
    </div>
    {installState&&installState.status!=='idle'&&<div role="status" className="release-center-message">{{checking:'正在检查版本…',downloading:`正在下载 ${Math.round((installState.downloaded||0)/1024/1024)} / ${Math.round((installState.total||0)/1024/1024)} MB`,verifying:'正在校验安装包…',cancelling:'正在取消下载并清理本次暂存文件…',cancelled:'已取消下载，当前程序与数据保留。可点击重新下载。',prepared:'校验通过。安装时会重启应用，请先结束生成任务；旧程序会备份，用户数据保留。',installing:'正在安装并重启…',succeeded:'上次更新已完成。',rolled_back:'上次更新失败，已恢复旧版本。',failed:'更新未完成，当前程序与数据保留。'}[installState.status]}{installState.error&&<p role="alert">{installState.error}</p>}</div>}
    {installState&&!installState.supported&&<p className="release-center-hint">当前运行的是开发目录；应用内安装在完整解压的 Windows 分享版中可用。</p>}
    {result?.releaseNotesText&&<div className="release-center-notes"><h4>更新说明</h4><pre>{result.releaseNotesText}</pre></div>}
   </section>
   <section className="release-center-section" aria-labelledby={`${titleId}-feedback`}>
    <div className="release-center-section-heading"><div><h3 id={`${titleId}-feedback`}>反馈预览</h3><p>这里只生成本地文本。应用不会替你提交，也不会附带上游原文、路径、提示词、Key、Cookie 或日志。</p></div></div>
    <div className="release-center-kind" role="tablist" aria-label="反馈类型"><button type="button" role="tab" aria-selected={kind==='bug'} onClick={()=>{setKind('bug');setPreview('');}}><Bug size={15}/>Bug</button><button type="button" role="tab" aria-selected={kind==='improvement'} onClick={()=>{setKind('improvement');setPreview('');}}><Lightbulb size={15}/>改进建议</button></div>
    <div className="release-center-form">
     <label>一句话摘要<input value={form.summary} maxLength={240} onChange={event=>change('summary',event.target.value)} placeholder="简要说明问题或建议"/></label>
     <label>{kind==='bug'?'复现步骤':'使用场景'}<textarea value={form.steps} maxLength={1200} onChange={event=>change('steps',event.target.value)} placeholder="请只写重现所需的操作，不粘贴日志或私密内容"/></label>
     <label>{kind==='bug'?'预期结果':'希望改善'}<textarea value={form.expected} maxLength={1200} onChange={event=>change('expected',event.target.value)}/></label>
     <label>{kind==='bug'?'实际结果':'当前影响'}<textarea value={form.actual} maxLength={1200} onChange={event=>change('actual',event.target.value)}/></label>
    </div>
    <fieldset className="release-center-diagnostics"><legend>结构化诊断信息</legend><p>以下字段由你选择，不会从错误原文或日志自动抓取。</p><div>{Object.entries(DIAGNOSTIC_LABELS).map(([key,labels])=><label key={key}>{key==='provider'?'接口类型':key==='featureLocation'?'功能位置':'已知错误码'}<select value={diagnosticChoices[key]} onChange={event=>{setDiagnosticChoices(current=>({...current,[key]:event.target.value}));setPreview('');}}>{(info?.feedbackOptions?.[key]||Object.keys(labels)).filter(value=>Object.hasOwn(labels,value)).map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>)}</div></fieldset>
    <div className="release-center-actions"><button type="button" className="primary" onClick={makePreview}><CheckCircle2 size={16}/>生成预览</button></div>
    {preview&&<div className="release-center-preview"><label>提交前预览<textarea ref={previewRef} aria-label="提交前预览" readOnly value={preview}/></label><div className="release-center-actions"><button type="button" onClick={copyPreview}><Clipboard size={16}/>复制预览</button><button type="button" onClick={exportPreview}><Download size={16}/>导出 Markdown</button><button type="button" disabled={!issueUrl} onClick={()=>openExternal(issueUrl)}><ExternalLink size={16}/>打开{kind==='bug'?' Bug':'改进'} Issue 表单</button></div>{!issueUrl&&<p className="release-center-hint">公开 Issue 表单待仓库配置；预览仍可复制或导出。</p>}</div>}
   </section>
   <section className="release-center-section release-center-security" aria-labelledby={`${titleId}-security`}><ShieldAlert size={22}/><div><h3 id={`${titleId}-security`}>安全问题单独报告</h3><p>凭据泄露、权限绕过等安全问题不要写入公开 Issue。</p>{info?.links?.security?<button type="button" onClick={()=>openExternal(info.links.security)}><ExternalLink size={16}/>打开私密安全报告入口</button>:<p className="release-center-hint">私密安全报告入口待发布仓库配置后提供。</p>}</div></section>
   {notice&&<p className="release-center-alert success" role="status">{notice}</p>}
  </div>
 </dialog>;
}
