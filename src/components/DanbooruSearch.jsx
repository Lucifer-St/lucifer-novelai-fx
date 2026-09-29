import {useEffect,useId,useRef,useState} from 'react';
import {Search} from 'lucide-react';
import {danbooruToken,completeDanbooruToken} from '../lib/danbooru-completion.mjs';

export default function DanbooruSearch({value,onChange,active}){
 const input=useRef(null),composing=useRef(false),sequence=useRef(0),id=useId();
 const [token,setToken]=useState(null),[items,setItems]=useState([]),[selected,setSelected]=useState(0);
 const dismiss=()=>{sequence.current++;setToken(null);setItems([]);setSelected(0);};
 function capture(){const el=input.current;if(composing.current||document.activeElement!==el||!active)return;setToken(danbooruToken(el.value,el.selectionStart,el.selectionEnd));setSelected(0);}
 useEffect(()=>{if(!active)dismiss();},[active]);
 useEffect(()=>{
  setItems([]);if(!token||!active)return;
  const revision=++sequence.current,controller=new AbortController();
  const timer=setTimeout(async()=>{try{const {localSuggestions}=await import('../lib/tag-client.mjs');const matches=await localSuggestions(token.query,controller.signal);if(sequence.current===revision&&!controller.signal.aborted)setItems(matches);}catch{}},100);
  return()=>{clearTimeout(timer);controller.abort();};
 },[token,active]);
 useEffect(()=>{if(token&&value!==token.value)dismiss();},[value]);
 const shown=active&&!!token&&items.length>0;
 function accept(item){if(composing.current||input.current.value!==token?.value)return dismiss();const next=completeDanbooruToken(token,item.tag);if(next.value.length>240)return dismiss();onChange(next.value);dismiss();requestAnimationFrame(()=>{input.current?.focus({preventScroll:true});input.current?.setSelectionRange(next.caret,next.caret);});}
 function keyDown(event){
  if(composing.current||event.nativeEvent.isComposing)return;
  if(event.key==='Escape'&&token){event.preventDefault();event.stopPropagation();dismiss();return;}
  if(!shown)return;
  if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setSelected(n=>(n+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);}
  if((event.key==='Tab'&&!event.shiftKey)||event.key==='Enter'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopPropagation();accept(items[selected]||items[0]);}
 }
 return <div className="danbooru-search"><label htmlFor={id}>搜索标签</label><div className="danbooru-search-row"><Search size={16}/><input ref={input} id={id} role="combobox" aria-label="Danbooru 搜索标签" aria-autocomplete="list" aria-expanded={!!shown} aria-controls={shown?id+'-list':undefined} aria-activedescendant={shown?id+'-'+selected:undefined} autoComplete="off" placeholder="输入标签或中文释义；空格分隔标签" value={value} maxLength={240} onChange={e=>{onChange(e.target.value);capture();}} onClick={capture} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))capture();}} onKeyDown={keyDown} onBlur={dismiss} onCompositionStart={()=>{composing.current=true;dismiss();}} onCompositionEnd={()=>{composing.current=false;capture();}}/><button className="primary" type="submit" onClick={dismiss}>搜索</button></div>
 {shown&&<div className="danbooru-completion"><div role="listbox" id={id+'-list'} aria-label="Danbooru 候选标签">{items.map((item,index)=><button key={item.tag} id={id+'-'+index} role="option" aria-selected={selected===index} tabIndex={-1} type="button" onPointerDown={e=>e.preventDefault()} onClick={()=>accept(item)}><strong>{token.prefix}{item.tag}</strong>{item.zh&&<small>{item.zh}</small>}</button>)}</div><small>本地词库 · ↑↓ 选择 · Enter / Tab 补全 · Esc 关闭</small></div>}
 </div>;
}
