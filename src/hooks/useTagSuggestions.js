import {useEffect,useRef,useState} from 'react';
import {tagAtCaret,mergeSuggestions,suggestionText} from '../lib/tag-suggestions.mjs';
import {GLOSSARY_EVENT,GLOSSARY_KEY} from '../lib/tag-glossary.mjs';

export function useTagSuggestions({input,value,mode,onChange,onReplace}){
  const [request,setRequest]=useState(null),[result,setResult]=useState({local:[],official:[],pending:false,message:''}),[active,setActive]=useState(0);
  const composing=useRef(false),sequence=useRef(0),current=useRef(null),suppress=useRef(false);
  const enabled=mode&&mode!=='off',shown=enabled&&request&&input.current===document.activeElement&&input.current?.getClientRects().length;
  const items=mergeSuggestions(result.official,result.local,request?.query||'');
  function dismiss(){current.current=null;sequence.current++;setRequest(null);setActive(0);}
  function capture(force=false){
    const el=input.current;if(!enabled||composing.current||suppress.current||el!==document.activeElement)return;
    const next=tagAtCaret(el.value,el.selectionStart,el.selectionEnd);if(!next){dismiss();return;}
    if(!force&&current.current?.value===next.value&&current.current?.start===next.start&&current.current?.end===next.end)return;
    next.force=force;current.current=next;setRequest(next);setActive(0);
  }
  useEffect(()=>{if(request&&value!==request.value)dismiss();},[value]);
  useEffect(()=>{dismiss();},[mode]);
  useEffect(()=>{
    const changed=()=>{if(current.current)capture(true);};
    const storageChanged=event=>{if(event.key===GLOSSARY_KEY)changed();};
    window.addEventListener(GLOSSARY_EVENT,changed);window.addEventListener('storage',storageChanged);
    return()=>{window.removeEventListener(GLOSSARY_EVENT,changed);window.removeEventListener('storage',storageChanged);};
  });
  useEffect(()=>{
    if(!request||!enabled)return;
    const id=++sequence.current,controller=new AbortController();
    const stillCurrent=()=>id===sequence.current&&!controller.signal.aborted;
    setResult({local:[],official:[],pending:false,message:''});
    const localTimer=setTimeout(async()=>{try{const {localSuggestions}=await import('../lib/tag-client.mjs');const tags=await localSuggestions(request.query,controller.signal);if(stillCurrent())setResult(v=>({...v,local:tags}));}catch{if(stillCurrent())setResult(v=>({...v,message:v.message||'本地词表暂不可用'}));}},60);
    return()=>{clearTimeout(localTimer);controller.abort();};
  },[request,mode]);
  function accept(candidate){
    const el=input.current,snapshot=current.current;
    if(!snapshot||composing.current||el.value!==snapshot.value||!el.getClientRects().length){dismiss();return;}
    const insert=suggestionText(candidate,snapshot.query),scroll=el.scrollTop;suppress.current=true;
    onReplace?.({before:el.value,start:snapshot.start,end:snapshot.end,inserted:insert});
    el.focus({preventScroll:true});el.setSelectionRange(snapshot.start,snapshot.end);
    if(!document.execCommand('insertText',false,insert)){el.setRangeText(insert,snapshot.start,snapshot.end,'end');onChange?.({target:el,currentTarget:el});}
    el.setSelectionRange(snapshot.start+insert.length,snapshot.start+insert.length);el.scrollTop=scroll;
    dismiss();suppress.current=false;
  }
  function keyDown(e){
    if(composing.current||e.isComposing||e.nativeEvent?.isComposing||e.keyCode===229)return false;
    if(enabled&&e.ctrlKey&&!e.altKey&&e.code==='Space'){e.preventDefault();capture(true);return true;}
    if(!shown||e.ctrlKey||e.metaKey||e.altKey)return false;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();return true;}
    if(e.key==='Enter'){dismiss();return false;}
    if(items.length&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();setActive(v=>(v+(e.key==='ArrowDown'?1:-1)+items.length)%items.length);return true;}
    if(e.key==='Tab'&&!e.shiftKey&&items.length){e.preventDefault();accept(items[Math.min(active,items.length-1)]);return true;}
    return false;
  }
  return {shown:!!shown,items,active:Math.min(active,Math.max(0,items.length-1)),result,query:request?.query||'',dismiss,capture,accept,keyDown,composing};
}
