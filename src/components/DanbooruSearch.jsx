import {useEffect,useId,useRef,useState} from 'react';
import {Search} from 'lucide-react';
import {danbooruToken,completeDanbooruToken} from '../lib/danbooru-completion.mjs';
import {GLOSSARY_EVENT,GLOSSARY_KEY} from '../lib/tag-glossary.mjs';

export default function DanbooruSearch({value,onChange,active}){
 const input=useRef(null),composing=useRef(false),frame=useRef(null),sequence=useRef(0),id=useId();
 const [token,setToken]=useState(null),[result,setResult]=useState(null),[selected,setSelected]=useState(0);
 function dismiss(){sequence.current++;cancelAnimationFrame(frame.current);setToken(null);setResult(null);setSelected(0);}
 function capture(){const el=input.current;if(composing.current||document.activeElement!==el||!active)return;setToken(danbooruToken(el.value,el.selectionStart,el.selectionEnd));setSelected(0);}
 useEffect(()=>{if(!active)dismiss();},[active]);
 useEffect(()=>()=>cancelAnimationFrame(frame.current),[]);
 useEffect(()=>{
  if(!token||!active)return;
  const revision=++sequence.current,controller=new AbortController();
  const timer=setTimeout(async()=>{try{const {localSuggestions}=await import('../lib/tag-client.mjs');const items=await localSuggestions(token.query,controller.signal);if(sequence.current===revision&&!controller.signal.aborted)setResult({token,items,message:''});}catch{if(sequence.current===revision&&!controller.signal.aborted)setResult({token,items:[],message:'本地词库读取失败，请重新点入搜索框重试。'});}},100);
  return()=>{clearTimeout(timer);controller.abort();};
 },[token,active]);
 useEffect(()=>{if(token&&value!==token.value)capture();},[value]);
 useEffect(()=>{const changed=()=>{if(token)capture();},storage=event=>{if(event.key===GLOSSARY_KEY)changed();};window.addEventListener(GLOSSARY_EVENT,changed);window.addEventListener('storage',storage);return()=>{window.removeEventListener(GLOSSARY_EVENT,changed);window.removeEventListener('storage',storage);};});
 const shown=active&&!!token,ready=result?.token===token,items=ready?result.items:[];
 useEffect(()=>{const option=document.getElementById(id+'-'+selected),list=option?.parentElement;if(list){if(option.offsetTop<list.scrollTop)list.scrollTop=option.offsetTop;else if(option.offsetTop+option.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=option.offsetTop+option.offsetHeight-list.clientHeight;}},[selected,ready,id]);
 function accept(item){if(composing.current||input.current.value!==token?.value)return dismiss();const next=completeDanbooruToken(token,item.tag);if(next.value.length>240)return dismiss();onChange(next.value);dismiss();frame.current=requestAnimationFrame(()=>{input.current?.focus({preventScroll:true});input.current?.setSelectionRange(next.caret,next.caret);});}
 function keyDown(event){
  if(composing.current||event.nativeEvent.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'&&token){event.preventDefault();event.stopPropagation();dismiss();return;}
  if(!shown&&event.key==='ArrowDown'){event.preventDefault();capture();return;}
  if(!shown||!items.length)return;
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setSelected(n=>(n+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);}
  if((event.key==='Tab'&&!event.shiftKey)||event.key==='Enter'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopPropagation();accept(items[selected]||items[0]);}
 }
 return <div className="danbooru-search"><label htmlFor={id}>搜索标签</label><div className="danbooru-search-row"><Search size={16}/><input ref={input} id={id} role="combobox" aria-label="Danbooru 搜索标签" aria-autocomplete="list" aria-expanded={!!shown} aria-controls={shown?id+'-list':undefined} aria-activedescendant={shown&&items.length?id+'-'+selected:undefined} autoComplete="off" placeholder="输入男孩、蓝发等中文，选择候选英文标签" value={value} maxLength={240} onChange={e=>{onChange(e.target.value);capture();}} onFocus={capture} onClick={capture} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))capture();}} onKeyDown={keyDown} onBlur={dismiss} onCompositionStart={()=>{composing.current=true;dismiss();}} onCompositionEnd={()=>{composing.current=false;cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(capture);}}/><button className="primary" type="submit" onClick={dismiss}>搜索</button></div>
 {shown&&<div className="danbooru-completion"><div role="listbox" id={id+'-list'} aria-label="Danbooru 候选标签">{items.map((item,index)=><button key={item.tag} id={id+'-'+index} role="option" aria-selected={selected===index} tabIndex={-1} type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>accept(item)}><strong>{token.prefix}{item.tag}</strong>{item.zh&&<small>{item.zh}</small>}</button>)}</div>{!items.length&&<p role="status">{!ready?'正在查找本地标签…':result.message||'本地词典暂未收录这个词，可换个说法、输入英文，或在「中文释义」中补充。'}</p>}<small>本地词库 · ↑↓ 选择 · Enter / Tab 补全 · Esc 关闭<br/>中文先选成英文标签，再点搜索；标签之间可用空格或逗号。</small></div>}
 </div>;
}
