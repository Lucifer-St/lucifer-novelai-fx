import {useEffect,useRef,useState,Suspense,lazy} from 'react';
import {X} from 'lucide-react';
const AtlasPanel=lazy(()=>import('./AtlasPanel'));
export default function AtlasWorkspace({open,onClose,onCollect,onImport}){
 const [visited,setVisited]=useState(false),ref=useRef(null);
 useEffect(()=>{if(open)setVisited(true);},[open]);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open,visited]);
 if(!visited)return null;
 return <dialog ref={ref} className="feature-dialog atlas-dialog" aria-label="法典图鉴" onCancel={e=>{e.preventDefault();onClose();}}><header className="feature-dialog-header"><h2>法典图鉴</h2><button aria-label="关闭功能面板" onClick={onClose}><X size={20}/></button></header><Suspense fallback={<div className="feature-loading">正在打开图鉴…</div>}><AtlasPanel active={open} onCollect={onCollect} onImport={onImport}/></Suspense></dialog>;
}
