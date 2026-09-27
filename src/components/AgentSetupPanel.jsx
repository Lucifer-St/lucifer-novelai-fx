import {useEffect,useRef,useState} from 'react';
import {Copy,Bot} from 'lucide-react';
import {api} from '../lib/api.mjs';
export default function AgentSetupPanel(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[copied,setCopied]=useState(''),[kind,setKind]=useState('prompt');const field=useRef(null);
 useEffect(()=>{const ac=new AbortController();api('/api/agent/setup',{signal:ac.signal}).then(setData).catch(e=>{if(!ac.signal.aborted)setError(e.message);});return()=>ac.abort();},[]);
 const value=kind==='prompt'?data?.agentPrompt:JSON.stringify(data?.config,null,2);
 async function copy(){try{await navigator.clipboard.writeText(value);setCopied('已复制，可以交给你的 Agent。');}catch{field.current?.focus();field.current?.select();setCopied('请复制已选中的配置文本。');}}
 return <div className="agent-setup-panel"><h3><Bot size={22}/>连接你的 Agent</h3><p>复制下面的配置说明，交给支持 MCP 的 Agent。它可以读取参数、管理预设、查询任务，并在你要求时生成图片。</p>{error?<p role="alert">{error}</p>:!data?<p>正在读取本机配置…</p>:data.available===false?<p>{data.message}</p>:<><div className="segment"><button aria-pressed={kind==='prompt'} onClick={()=>setKind('prompt')}>交给 Agent 的说明</button><button aria-pressed={kind==='config'} onClick={()=>setKind('config')}>MCP JSON</button></div><textarea ref={field} readOnly aria-label="MCP 配置" value={value||''} rows={15}/><button className="primary" onClick={copy}><Copy size={14}/>复制{kind==='prompt'?'配置说明':'JSON'}</button><p role="status">{copied}</p><small>配置不包含 API Key。运行时使用这份应用自己的设置；移动应用文件夹后，请重新复制配置。应用需要先启动。</small></>}</div>;
}
