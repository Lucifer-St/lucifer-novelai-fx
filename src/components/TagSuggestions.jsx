import {createPortal} from 'react-dom';
import {useEffect} from 'react';
import {TAG_CATEGORIES,suggestionText} from '../lib/tag-suggestions.mjs';
import '../tag-suggestions.css';
export default function TagSuggestions({suggestions:s,id,label,targetId}){
  useEffect(()=>{if(s.shown){const option=document.getElementById(`${id}-${s.active}`),list=option?.parentElement;if(list){if(option.offsetTop<list.scrollTop)list.scrollTop=option.offsetTop;else if(option.offsetTop+option.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=option.offsetTop+option.offsetHeight-list.clientHeight;}}},[s.active,s.shown,s.items.length,id]);
  const target=targetId&&document.getElementById(targetId);
  if(!s.shown||!target)return null;
  return createPortal(<section className="tag-suggestions" aria-label={`${label}标签建议`} onPointerDown={e=>e.preventDefault()}>
    <header><span>{s.result.official.length?'NovelAI 关联词':'本地词库'}{s.result.pending&&<small> · 查询官方…</small>}</span><button type="button" title="关闭标签建议（Esc）" aria-label="关闭标签建议" onClick={s.dismiss}>×</button></header>
    <div className="tag-options" id={id} role="listbox" aria-label="候选标签">
      {s.items.map((item,i)=><button type="button" role="option" tabIndex={-1} id={`${id}-${i}`} key={item.source+item.tag} aria-selected={s.active===i} className={`tag-option${s.active===i?' active':''}`} onClick={()=>s.accept(item)} title={item.glossaryOnly?'词典收录；未在本地 Danbooru 标签表找到，效果未验证':item.alias?`别名：${item.alias}`:item.source==='official'?'官方候选；熟悉度不代表生成成功率':'本地标签候选；未验证生成效果'}>
        <i className={`tag-category category-${item.category??'unknown'}`} style={item.source==='official'&&item.confidence!==null?{opacity:Math.max(.25,item.confidence)}:undefined}/>
        <span><strong>{suggestionText(item,s.query)}</strong>{item.zh&&<small style={{display:'block'}}>中文 · {item.zh}</small>}{item.alias&&<small>别名 · {item.alias}</small>}</span><small>{item.source==='official'?'NAI':item.source==='personal'?'我的词典':item.source==='bundled'?'基础词典':`Danbooru · ${TAG_CATEGORIES[item.category]||'标签'}`}</small>
      </button>)}
      {!s.items.length&&<p>{s.result.pending?'正在查找候选…':s.result.message||'没有匹配的词条，继续输入即可。'}</p>}
    </div>
    <footer><span>{s.result.message||'Tab 选词 · ↑↓ 切换 · Esc 关闭'}</span><small>只查询当前词条</small></footer>
  </section>,target);
}
