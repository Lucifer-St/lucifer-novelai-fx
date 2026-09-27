import {isNegativeTarget} from '../lib/prompt-targets.mjs';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Scissors,X,Image as ImageIcon,ChevronRight,Search,Check} from 'lucide-react';
import {api} from '../lib/api.mjs';
import {readCardUsage,rankQuickCards} from '../lib/card-usage.mjs';
const SNIPPETS=new Set(['snippet','style','starter','negative','favorite']);
function Face({entry}){return entry?.cover?<img src={entry.cover} alt={entry.title} loading="lazy" draggable="false"/>:<span className="hanging-card-placeholder"><ImageIcon size={22}/><small>添加封面</small></span>;}
export default function PromptCardStrip({cards=[],field,label,selection,saving,onLibrary,onSave,onRemove,onEdit,onPick,libraryRevision=0,active=true}){
 const canSave=selection?.field===field&&selection.end>selection.start;
 const [open,setOpen]=useState(false),[filtering,setFiltering]=useState(false),[entries,setEntries]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
 const quickPanel=useRef(null),loaded=useRef({revision:-1,at:0,ids:new Set()}),ids=cards.map(c=>c.presetId||'').join('|');
 useEffect(()=>{if(!active||!open&&!ids)return;if(loaded.current.revision===libraryRevision&&ids.split('|').filter(Boolean).every(id=>loaded.current.ids.has(id))&&(!open||Date.now()-loaded.current.at<15000))return;let alive=true;setLoading(true);setError('');api('/api/library').then(d=>{if(alive){loaded.current={revision:libraryRevision,at:Date.now(),ids:new Set(d.entries.map(e=>e.id))};setEntries(d.entries);}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[open,ids,libraryRevision,active]);

 const entriesById=useMemo(()=>new Map(entries.map(e=>[e.id,e])),[entries]);
 const ranked=useMemo(()=>rankQuickCards(entries.filter(e=>SNIPPETS.has(e.kind)&&e.text&&(isNegativeTarget(field)||e.kind!=='negative')),readCardUsage()),[entries,open,field]);
 const shown=ranked.filter(e=>!query||[e.title,e.category,e.text].join(' ').toLowerCase().includes(query.toLowerCase())).slice(0,12);
 return <section className="prompt-card-strip" aria-label={label||(field==='prompt'?'本次正面卡片':'本次负面卡片')}>
  <header data-character-role="rack"><span>{label||'本次使用的卡片'}</span><div><button type="button" onMouseDown={e=>e.preventDefault()} disabled={!canSave||saving} onClick={onSave}><Scissors size={12}/>选区存为卡片</button><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Plus size={12}/>{open?'收起卡片':'添加卡片'}</button></div></header>
  <div className={cards.length?'prompt-card-rack':'prompt-card-rack empty-rack'}>
   {cards.map((card,i)=>{const live=entriesById.get(card.presetId),face={...card,cover:live?.cover||''};return <div className={`hanging-card-slot${card.detached?' detached':''}`} style={{'--card-tilt':`${[-2,1.5,-1,2][i%4]}deg`}} key={card.instanceId}>
    <button type="button" className="hanging-card-frame" aria-label={`编辑已用卡片 ${card.title}`} title={card.detached?`${card.title} · 文字已改写，移除时仅解除关联`:card.title} onClick={()=>onEdit(card)}><Face entry={face}/><span className="hanging-card-title">{card.title}</span></button>
    <span className="card-hanger" aria-hidden="true"/><button className="unhook-card" type="button" aria-label={`移除卡片 ${card.title}`} onClick={()=>onRemove(field,card.instanceId,{quiet:true})}><X size={11}/></button>{card.detached&&<span className="detached-mark" title="文字追踪已解除">·</span>}
   </div>;})}
   {!cards.length&&<p><ImageIcon size={18}/>把喜欢的卡片挂上来，组合这一次的画面。</p>}
  </div>
  {open&&<div className="quick-card-window" role="region" aria-label="快捷卡片" ref={quickPanel}>
   <header><strong>常用卡片</strong><div><button type="button" aria-label="筛选常用卡片" aria-expanded={filtering} onClick={()=>{setFiltering(v=>!v);setQuery('');}}><Search size={12}/></button><button type="button" onClick={()=>{setOpen(false);onLibrary(field);}}>更多<ChevronRight size={12}/></button><button type="button" aria-label="关闭快捷卡片" onClick={()=>setOpen(false)}><X size={13}/></button></div></header>
   {filtering&&<label className="quick-card-search"><Search size={12}/><input aria-label="搜索快捷卡片" placeholder="名称、分类或标签" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
   {error?<p className="field-error">{error}</p>:loading&&!entries.length?<p className="hint">正在读取卡片…</p>:shown.length?<div className="quick-card-rack">{shown.map((entry,i)=>{const used=cards.find(c=>c.presetId===entry.id);return <button type="button" className={used?'quick-card selected':'quick-card'} style={{'--card-tilt':`${i%2?1:-1}deg`}} key={entry.id} aria-label={`使用卡片 ${entry.title}`} aria-pressed={!!used} title={`${entry.title} · ${entry.category||'其他'}`} onClick={()=>used?onRemove(field,used.instanceId,{quiet:true}):onPick(entry,field)}><Face entry={entry}/><span>{entry.title}</span>{used&&<i><Check size={12}/></i>}</button>;})}</div>:<p className="quick-card-empty">{query?'没有匹配的卡片。':'还没有卡片；点击“更多”新建，或从 Prompt 选区保存。'}</p>}
   
  </div>}
 </section>;
}
