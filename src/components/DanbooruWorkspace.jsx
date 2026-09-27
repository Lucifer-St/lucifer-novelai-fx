import {useEffect,useLayoutEffect,useRef,useState,Suspense,lazy} from 'react';
import {RefreshCw,X} from 'lucide-react';
const DanbooruPanel=lazy(()=>import('./DanbooruPanel'));

export default function DanbooruWorkspace({open,onClose,onCollect}){
 const [visited,setVisited]=useState(false),[refreshRevision,setRefreshRevision]=useState(0);
 const ref=useRef(null),scroll=useRef([]),returnFocus=useRef(null),insideFocus=useRef(null);
 useEffect(()=>{if(open)setVisited(true);},[open]);
 useLayoutEffect(()=>{
  const dialog=ref.current;if(!dialog)return;
  if(!open&&dialog.open){
   scroll.current=[dialog,...dialog.querySelectorAll('[data-danbooru-scroll]')].map(element=>({element,top:element.scrollTop,left:element.scrollLeft}));
   insideFocus.current=dialog.contains(document.activeElement)?document.activeElement:null;
   dialog.close();returnFocus.current?.focus?.({preventScroll:true});return;
  }
  if(open&&!dialog.open){
   returnFocus.current=document.activeElement;dialog.showModal();
   insideFocus.current?.focus?.({preventScroll:true});
   const restore=()=>{for(const {element,top,left} of scroll.current)if(element.isConnected){element.scrollTop=top;element.scrollLeft=left;}};
   restore();const frame=requestAnimationFrame(restore);return()=>cancelAnimationFrame(frame);
  }
 },[open,visited]);
 if(!visited)return null;
 return <dialog ref={ref} className="feature-dialog danbooru-dialog" aria-label="D站图库" onCancel={event=>{event.preventDefault();onClose();}}>
  <header className="feature-dialog-header"><h2>D站图库</h2><div className="danbooru-dialog-actions"><button aria-label="刷新D站图库" title="刷新当前页，保留筛选条件" onClick={()=>setRefreshRevision(value=>value+1)}><RefreshCw size={17}/><span>刷新</span></button><button aria-label="关闭功能面板" onClick={onClose}><X size={20}/></button></div></header>
  <Suspense fallback={<div className="feature-loading">正在打开图库…</div>}><DanbooruPanel active={open} refreshRevision={refreshRevision} onCollect={onCollect}/></Suspense>
 </dialog>;
}
